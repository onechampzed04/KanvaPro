import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { Design } from '../models/Design';
import { DesignType } from '../models/enums';
import { designService } from '../services/designService';
import { assetService } from '../services/assetService';
import { designPageService } from '../services/designPageService';
import { designVersionService } from '../services/designVersionService';

import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';

export const createDesign = async (req: Request, res: Response) => {
    // Thêm page_type vào req.body
    const { title, width, height, design_type, page_type } = req.body;
    const userId = (req as any).user?.id;

    try {
        const id = uuidv4();
        await designService.createDesign({
            id,
            user_id: userId,
            title: title || 'Untitled Design',
            width: width || 1920,
            height: height || 1080,
            design_type: design_type || 'presentation',
            page_type: page_type || 'canvas' // Mặc định là canvas kéo thả
        });

        res.status(201).json({ id, message: 'Design created successfully' });
    } catch (error) {
        console.error('Create Design Error:', error);
        res.status(500).json({ error: 'Failed to create design' });
    }
};

export const getUserDesigns = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const tab = req.query.tab as string;

    try {
        let result;
        if (tab === 'shared') {
            result = await designService.getSharedDesigns(userId);
        } else {
            result = await designService.getUserDesigns(userId);
        }
        res.json({ designs: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch designs' });
    }
};

export const getDesignById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const design = await designService.getDesignById(id);
        if (!design) return res.status(404).json({ error: 'Design not found' });

        const pages = await designPageService.getPagesWithElementsByDesignId(id);
        const currentUserRole = (req as any).designRole || null;

        res.json({ ...design, pages, current_user_role: currentUserRole });
    } catch (error) {
        console.error("Lỗi getDesignById:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// === FIX #4: LAZY LOADING - GET THÔNG TIN MỎNG (không có elements) ===
export const getDesignMeta = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const design = await designService.getDesignById(id);
        if (!design) return res.status(404).json({ error: 'Design not found' });

        const pages = await designPageService.getPagesByDesignIdWithoutElements(id);
        const currentUserRole = (req as any).designRole || null;

        res.json({ ...design, pages, current_user_role: currentUserRole });
    } catch (error) {
        console.error("Lỗi getDesignMeta:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// === FIX #4: LAZY LOADING - LẤY ELEMENTS CỦA MỘT TRANG ===
export const getPageElements = async (req: Request, res: Response) => {
    const { pageId } = req.params;
    try {
        const elements = await designPageService.getElementsByPageId(pageId);
        res.json({ pageId, elements });
    } catch (error) {
        console.error("Lỗi getPageElements:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, elements } = req.body;
    const userId = (req as any).user?.id;

    try {
        await designService.updateDesign(id, { title }, elements);

        res.json({ success: true, message: "Design saved successfully" });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ error: "Failed to save design" });
    }
};

export const deleteDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await db.execute('UPDATE designs SET is_deleted = true WHERE id = $1', [id]);
        res.json({ message: 'Design moved to trash' });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
};

export const saveFullDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, thumbnail_url, pages, version } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: Missing User ID" });
    }

    try {
        // === OCC: Chỉ conflict khi người dùng KHÁC lưu (không phải autosave của chính mình) ===
        if (version) {
            const current = await db.getOne(
                `SELECT updated_at, last_modified_by FROM designs WHERE id = $1`,
                [id]
            );
            if (current && current.last_modified_by && current.last_modified_by !== userId) {
                const dbTimestamp = new Date(current.updated_at).getTime();
                const clientTimestamp = new Date(version).getTime();
                if (dbTimestamp > clientTimestamp + 5000) {
                    return res.status(409).json({
                        error: 'Conflict: Design was modified by another user',
                        server_version: current.updated_at,
                    });
                }
            }
        }

        await designService.saveFullDesign(id, userId, { title, thumbnail_url }, pages);

        const updated = await db.getOne(`SELECT updated_at FROM designs WHERE id = $1`, [id]);
        res.json({ success: true, message: "Design saved successfully!", updated_at: updated?.updated_at });
    } catch (error) {
        console.error("Save Design Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getRecentStickers = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    try {
        // Truy vấn lấy các src duy nhất được dùng gần đây nhất bởi user
        const query = `
            SELECT 
                de.properties->>'src' as url,
                MAX(de.updated_at) as last_used
            FROM design_elements de
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1 
              AND de.properties->>'src' IS NOT NULL
              AND de.properties->>'src' != ''
            GROUP BY de.properties->>'src'
            ORDER BY last_used DESC
            LIMIT $2 OFFSET $3
        `;

        // Đếm tổng số lượng sticker để làm phân trang
        const countQuery = `
            SELECT COUNT(DISTINCT de.properties->>'src') as total
            FROM design_elements de
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1 AND de.properties->>'src' IS NOT NULL
        `;

        const result = await db.query(query, [userId, limit, offset]);
        const countResult = await db.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total) || 0;

        res.json({
            data: result.rows,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error) {
        console.error("Get Recent Stickers Error:", error);
        res.status(500).json({ error: "Failed to fetch recent stickers" });
    }
};
// export const exportVideo = async (req: Request, res: Response) => {
//     try {
//         // frames: Mảng chứa các chuỗi base64 của từng khung hình
//         const { frames, fps = 30 } = req.body;

//         if (!frames || frames.length === 0) {
//             return res.status(400).json({ error: "Không có khung hình nào được gửi lên!" });
//         }

//         const jobId = uuidv4();
//         // Tạo thư mục tạm tên 'temp' nằm ở thư mục gốc của project backend
//         const tempDir = path.join(process.cwd(), 'temp', jobId);
//         await fs.ensureDir(tempDir);

//         console.log(`[Video Export] Bắt đầu xử lý ${frames.length} frames...`);

//         // 1. Lưu tất cả ảnh base64 thành file .png vật lý
//         const writePromises = frames.map((base64Str: string, index: number) => {
//             const base64Data = base64Str.replace(/^data:image\/png;base64,/, "");
//             // Đặt tên theo số thứ tự (0001, 0002) để FFmpeg đọc đúng luồng
//             const fileName = `frame-${String(index + 1).padStart(4, '0')}.png`; 
//             return fs.writeFile(path.join(tempDir, fileName), base64Data, 'base64');
//         });
//         await Promise.all(writePromises);

//         // 2. Gọi FFmpeg ráp ảnh thành video MP4
//         const outputPath = path.join(process.cwd(), 'temp', `${jobId}_output.mp4`);
//         console.log(`[Video Export] Đang dùng FFmpeg render Video...`);
//         // SỬA LỖI 1: Đổi toàn bộ dấu gạch chéo ngược (Windows) thành gạch chéo tới (Linux/FFmpeg chuẩn)
//         const inputPattern = path.join(tempDir, 'frame-%04d.png').replace(/\\/g, '/');

//         ffmpeg()
//             .input(inputPattern) // Dùng đường dẫn đã fix
//             .inputFPS(fps)
//             .videoCodec('libx264')
//             .outputOptions([
//                 // SỬA LỖI 2: Ép kích thước khung hình về số chẵn (Làm tròn xuống)
//                 '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', 
//                 '-pix_fmt yuv420p', 
//                 '-crf 25' 
//             ])
//             .save(outputPath)
//             .on('end', async () => {
//                 console.log(`[Video Export] Hoàn tất! Gửi file về Frontend...`);
//                 res.download(outputPath, 'Canva_Pro_Video.mp4', async (err) => {
//                     await fs.remove(tempDir);
//                     await fs.remove(outputPath);
//                 });
//             })
//             // SỬA LỖI 3: Bắt FFmpeg phải in ra lý do thực sự khiến nó sập (stderr)
//             .on('error', async (err, stdout, stderr) => {
//                 console.error(`[Video Export] Lỗi FFmpeg:`, err.message);
//                 console.error(`[NGUYÊN NHÂN GỐC TỪ FFMPEG]:\n`, stderr); // ĐÂY LÀ CHÌA KHÓA!

//                 await fs.remove(tempDir);
//                 res.status(500).json({ error: "Lỗi trong quá trình render video" });
//             });

//     } catch (error) {
//         console.error("Lỗi xuất video:", error);
//         res.status(500).json({ error: "Lỗi Server" });
//     }
// };

export const exportVideo = async (req: Request, res: Response) => {
    try {
        const file = (req as any).file;
        if (!file) return res.status(400).json({ error: "Không nhận được file video!" });

        const jobId = uuidv4();
        const tempDir = os.tmpdir();

        const nativeInputPath = path.join(tempDir, `kanva_${jobId}_input.webm`);
        const nativeOutputPath = path.join(tempDir, `kanva_${jobId}_output.mp4`);

        const ffmpegInputPath = nativeInputPath.replace(/\\/g, '/');
        const ffmpegOutputPath = nativeOutputPath.replace(/\\/g, '/');

        await fs.writeFile(nativeInputPath, file.buffer);

        console.log(`[Video Export] ⏳ Đang xử lý file WebM (${file.size} bytes)...`);

        ffmpeg(ffmpegInputPath)
            .addOption('-y')
            .inputOptions(['-fflags', '+genpts'])
            .outputOptions([
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-r', '60',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-an'
            ])
            .save(ffmpegOutputPath)
            .on('end', async () => {
                console.log(`[Video Export] ✅ Convert xong! Đang mã hóa thành chuỗi an toàn...`);

                try {
                    // Chờ Windows nhả khóa file
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // ĐỌC VIDEO VÀO RAM VÀ MÃ HÓA THÀNH CHUỖI BASE64
                    const videoBuffer = await fs.readFile(nativeOutputPath);
                    const base64Video = videoBuffer.toString('base64');

                    console.log(`[Video Export] 📦 Đã mã hóa xong. Bắt đầu gửi JSON qua mạng!`);

                    // 🔥 GỬI BẰNG JSON ĐỂ VƯỢT MẶT LỖI ĐỨT STREAM CỦA TRÌNH DUYỆT
                    res.status(200).json({
                        success: true,
                        data: base64Video
                    });

                    console.log(`[Video Export] 🏁 Đã gửi thành công nguyên khối JSON!`);

                } catch (e) {
                    console.error("Lỗi đọc file:", e);
                    if (!res.headersSent) res.status(500).json({ error: "Lỗi hệ thống file" });
                } finally {
                    // Dọn rác
                    await fs.remove(nativeInputPath).catch(() => { });
                    await fs.remove(nativeOutputPath).catch(() => { });
                }
            })
            .on('error', async (err) => {
                console.error("❌ Lỗi FFmpeg:", err.message);
                await fs.remove(nativeInputPath).catch(() => { });
                if (!res.headersSent) res.status(500).json({ error: "Convert thất bại" });
            });
    } catch (error) {
        console.error("Lỗi Server:", error);
        res.status(500).json({ error: "Lỗi Server" });
    }
};

export const saveDesignVersion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;

        console.log(`[Version] Đang yêu cầu chụp Snapshot cho Design ID: ${id}`);

        const versionNumber = await designVersionService.createVersionSnapshot(id, userId);

        console.log(`[Version] ✅ Đã lưu thành công Version số ${versionNumber}`);
        res.json({ message: "Lưu phiên bản thành công", versionNumber });
    } catch (error) {
        // NÂNG CẤP DÒNG NÀY ĐỂ BẮT LỖI CHI TIẾT
        console.error("\n❌ [LỖI NGHIÊM TRỌNG KHI LƯU VERSION]:", error, "\n");
        res.status(500).json({ error: "Lỗi lưu phiên bản" });
    }
};

export const getDesignVersions = async (req: Request, res: Response) => {
    try {
        const versions = await designVersionService.getVersionHistory(req.params.id);
        res.json({ versions });
    } catch (error) {
        res.status(500).json({ error: "Lỗi lấy lịch sử" });
    }
};

export const restoreDesignVersion = async (req: Request, res: Response) => {
    try {
        const { id, versionId } = req.params;
        const userId = (req as any).user?.id;
        await designVersionService.restoreVersion(id, versionId, userId);
        res.json({ message: "Khôi phục thành công" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi khôi phục phiên bản" });
    }
};

// ── TRASH BIN ────────────────────────────────────────────────────────────────

export const getTrashDesigns = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    try {
        const result = await db.query(
            `SELECT * FROM designs WHERE user_id = $1 AND is_deleted = true ORDER BY deleted_at DESC`,
            [userId]
        );
        res.json({ designs: result.rows });
    } catch { res.status(500).json({ error: 'Failed to fetch trash designs' }); }
};

export const emptyTrash = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    try {
        await db.execute('DELETE FROM designs WHERE user_id = $1 AND is_deleted = true', [userId]);
        res.json({ message: 'Trash emptied' });
    } catch { res.status(500).json({ error: 'Failed to empty trash' }); }
};

export const restoreDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    try {
        await db.execute(
            'UPDATE designs SET is_deleted = false, deleted_at = NULL WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        res.json({ message: 'Design restored' });
    } catch { res.status(500).json({ error: 'Restore failed' }); }
};

export const permanentlyDeleteDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    try {
        await db.execute(
            'DELETE FROM designs WHERE id = $1 AND user_id = $2 AND is_deleted = true',
            [id, userId]
        );
        res.json({ message: 'Permanently deleted' });
    } catch { res.status(500).json({ error: 'Permanent delete failed' }); }
};

export const bulkDeleteDesigns = async (req: Request, res: Response) => {
    const { designIds } = req.body;
    const userId = (req as any).user?.id;
    if (!Array.isArray(designIds) || designIds.length === 0) {
        return res.status(400).json({ error: 'Invalid design IDs' });
    }
    try {
        await db.query(
            'UPDATE designs SET is_deleted = true, deleted_at = NOW() WHERE id = ANY($1) AND user_id = $2',
            [designIds, userId]
        );
        res.json({ message: 'Moved to trash' });
    } catch { res.status(500).json({ error: 'Bulk delete failed' }); }
};


// ── VIDEO JOB QUEUE (FIX #5: Server-side render) ─────────────────────────────
// In-memory Map làm Queue đơn giản — không cần Redis cho đồ án
const videoJobs = new Map<string, {
    state: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    downloadUrl?: string;
    error?: string;
    createdAt: Date;
}>();

export const createVideoJob = async (req: Request, res: Response) => {
    const { title, pages, fps = 60 } = req.body;
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: 'Không có trang nào để render' });
    }

    const jobId = uuidv4();
    videoJobs.set(jobId, { state: 'pending', progress: 0, createdAt: new Date() });
    res.json({ jobId, message: 'Video job created. Poll /export/video-job/:jobId for status.' });

    // Render chạy hoàn toàn trong background (không block API)
    setImmediate(async () => {
        const job = videoJobs.get(jobId)!;
        job.state = 'processing';

        try {
            const tempDir = path.join(os.tmpdir(), `kanva_video_${jobId}`);
            await fs.ensureDir(tempDir);
            const outputPath = path.join(tempDir, `output_${jobId}.mp4`);
            let concatContent = '';

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const color = (page.background_color || '#ffffff').replace('#', '');
                const duration = Number(page.duration) || 5;
                const w = page.width || 1920;
                const h = page.height || 1080;
                const segPath = path.join(tempDir, `seg_${i}.mp4`);
                const segPathUnix = segPath.replace(/\\/g, '/');

                // Dùng FFmpeg tạo màu nền cho từng trang
                // Production: thay bằng Puppeteer chụp ảnh Canvas thật
                await new Promise<void>((resolve, reject) => {
                    ffmpeg()
                        .input(`color=c=#${color}:s=${w}x${h}:r=${fps}:d=${duration}`)
                        .inputFormat('lavfi')
                        .output(segPath)
                        .outputOptions(['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'])
                        .on('end', () => resolve())
                        .on('error', (e: Error) => reject(e))
                        .run();
                });

                concatContent += `file '${segPathUnix}'\n`;
                job.progress = Math.round(((i + 1) / pages.length) * 80);
            }

            // Ghi file danh sách concat
            const concatList = path.join(tempDir, 'concat.txt');
            await fs.writeFile(concatList, concatContent);

            // Ghép tất cả các đoạn lại thành 1 file MP4
            await new Promise<void>((resolve, reject) => {
                ffmpeg()
                    .input(concatList)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .output(outputPath)
                    .outputOptions(['-c', 'copy'])
                    .on('end', () => resolve())
                    .on('error', (e: Error) => reject(e))
                    .run();
            });

            job.progress = 95;

            // Lưu file vào public/exports để trả link tải về
            const exportDir = path.join(process.cwd(), 'public', 'exports');
            await fs.ensureDir(exportDir);
            const safeName = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_');
            const exportFileName = `${safeName}_${jobId}.mp4`;
            await fs.copy(outputPath, path.join(exportDir, exportFileName));
            await fs.remove(tempDir);

            job.state = 'completed';
            job.progress = 100;
            job.downloadUrl = `/exports/${exportFileName}`;

        } catch (err: any) {
            console.error('[VideoJob] Render error:', err.message);
            job.state = 'failed';
            job.error = err.message;
        }

        // Dọn job khỏi memory sau 1 giờ
        setTimeout(() => videoJobs.delete(jobId), 3600 * 1000);
    });
};

export const getVideoJobStatus = async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = videoJobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job không tồn tại hoặc đã hết hạn' });
    res.json({
        jobId,
        state: job.state,
        progress: job.progress,
        downloadUrl: job.downloadUrl,
        error: job.error,
    });
};
