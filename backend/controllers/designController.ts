import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { Design } from '../models/Design';
import { DesignType } from '../models/enums';
import { designService } from '../services/designService';
import { assetService } from '../services/assetService';
import { designPageService } from '../services/designPageService';
import { globalIo } from '../sockets/collaboration';
import { revisionStore } from '../ot/revisionStore';
import { designVersionService } from '../services/designVersionService';

import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';

export const createDesign = async (req: Request, res: Response) => {
    // Thêm page_type vào req.body
    const { title, width, height, design_type, page_type, team_id } = req.body;
    const userId = (req as any).user?.id;
    const workspaceId = req.headers['x-workspace-id'] as string;
    
    // Nếu tạo từ Dashboard, frontend có thể không gửi team_id mà gửi qua X-Workspace-Id
    const finalTeamId = team_id || (workspaceId && workspaceId !== 'personal' ? workspaceId : null);

    try {
        // [SECURITY FIX - Missing Validation]
        // Nếu có finalTeamId, phải xác nhận userId thực sự là thành viên của team đó.
        // Ngăn tài khoản bất kỳ tạo design "ké" vào team Pro của người khác.
        if (finalTeamId) {
            const memberCheck = await db.query(
                `SELECT 1 FROM team_members tm
                 JOIN teams t ON t.id = tm.team_id
                 WHERE tm.team_id = $1 AND tm.user_id = $2 AND t.is_deleted = false`,
                [finalTeamId, userId]
            );
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Bạn không phải thành viên của nhóm này và không thể tạo thiết kế trong nhóm.'
                });
            }
        }

        const id = uuidv4();
        await designService.createDesign({
            id,
            user_id: userId,
            title: title || 'Untitled Design',
            width: width || 1920,
            height: height || 1080,
            design_type: design_type || 'presentation',
            page_type: page_type || 'canvas',
            team_id: finalTeamId || null
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
    const workspaceId = req.headers['x-workspace-id'] as string;

    try {
        let result;
        if (tab === 'shared') {
            result = await designService.getSharedDesigns(userId, workspaceId);
        } else if (tab === 'all') {
            const myDesigns = await designService.getUserDesigns(userId, workspaceId);
            const sharedDesigns = await designService.getSharedDesigns(userId, workspaceId);
            const map = new Map();
            myDesigns.forEach(d => map.set(d.id, d));
            sharedDesigns.forEach(d => {
                if (!map.has(d.id)) map.set(d.id, d);
            });
            result = Array.from(map.values()).sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        } else {
            result = await designService.getUserDesigns(userId, workspaceId);
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
        const isPublicAccess = (req as any).isPublicAccess || false;

        res.json({ ...design, pages, current_user_role: currentUserRole, is_public_access: isPublicAccess });
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
        const isPublicAccess = (req as any).isPublicAccess || false;

        res.json({ ...design, pages, current_user_role: currentUserRole, is_public_access: isPublicAccess });
    } catch (error) {
        console.error("Lỗi getDesignMeta:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// === FIX #4: LAZY LOADING - LẤY ELEMENTS CỦA MỘT TRANG ===
// [SECURITY FIX - IDOR] Verify rằng pageId PHẢI thuộc về designId trong URL.
// Nếu không check: Alice dùng designId của mình + pageId của Bob → đọc trộm data.
export const getPageElements = async (req: Request, res: Response) => {
    const { id: designId, pageId } = req.params;
    try {
        // Bước 1: Xác minh ownership — pageId phải thuộc đúng designId
        const pageCheck = await db.query(
            `SELECT id FROM design_pages WHERE id = $1 AND design_id = $2 AND is_deleted = false`,
            [pageId, designId]
        );
        if (pageCheck.rows.length === 0) {
            // Trả 404 thay vì 403 để tránh kẻ tấn công phân biệt được
            // "trang không tồn tại" vs "trang tồn tại nhưng không thuộc design này"
            return res.status(404).json({ error: 'Trang không tồn tại trong thiết kế này' });
        }

        // Bước 2: Lấy elements sau khi đã xác minh ownership
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

export const renameDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || title.trim() === '') {
        return res.status(400).json({ error: "Tên thiết kế không được để trống" });
    }
    try {
        await db.execute('UPDATE designs SET title = $1, updated_at = NOW() WHERE id = $2', [title.trim(), id]);
        res.json({ success: true, message: "Đã đổi tên thiết kế" });
    } catch (error) {
        console.error("Rename design error:", error);
        res.status(500).json({ error: "Lỗi đổi tên thiết kế" });
    }
};

export const deleteDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        // [FIX - Cron Cleanup Bug] Phải cập nhật CÙNG LÚC is_deleted + deleted_at.
        // Cron Job xóa design sau 30 ngày dựa vào:
        //   WHERE is_deleted = true AND deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'
        // Nếu deleted_at = NULL → Cron KHÔNG BAO GIỜ nhận ra design này để dọn!
        await db.execute(
            'UPDATE designs SET is_deleted = true, deleted_at = NOW() WHERE id = $1',
            [id]
        );
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

    // version từ client là integer (Strict OCC) hoặc timestamp string (backward compat)
    // Nếu là số nguyên → dùng Strict OCC. Nếu là string → bỏ qua (cũ)
    const clientVersion = typeof version === 'number' ? version : undefined;

    try {
        const result = await designService.saveFullDesign(
            id, userId, { title, thumbnail_url }, pages, clientVersion
        );

        const updated = await db.getOne(`SELECT updated_at, version FROM designs WHERE id = $1`, [id]);
        res.json({
            success: true,
            message: "Design saved successfully!",
            updated_at: updated?.updated_at,
            version: updated?.version,   // ← Trả version mới về cho frontend cập nhật
        });
    } catch (error: any) {
        // ─── VERSION_CONFLICT: Người khác đã lưu trước ───────────────
        if (error.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                error: 'VERSION_CONFLICT',
                message: 'Bản thiết kế đã được cập nhật bởi người khác.',
                serverVersion: error.serverVersion,
            });
        }
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
                COALESCE(BOOL_OR((de.properties->>'is_premium')::boolean), false) as is_premium,
                MAX(de.updated_at) as last_used
            FROM design_elements de
            JOIN design_pages dp ON de.page_id = dp.id
            JOIN designs d ON dp.design_id = d.id
            WHERE d.user_id = $1 
              AND de.properties->>'src' IS NOT NULL
              AND de.properties->>'src' != ''
              AND de.properties->>'src' NOT LIKE '%/uploads/images/pptx_%'
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
            WHERE d.user_id = $1 
              AND de.properties->>'src' IS NOT NULL
              AND de.properties->>'src' NOT LIKE '%/uploads/images/pptx_%'
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

export const getDesignVersionSnapshot = async (req: Request, res: Response) => {
    try {
        const { id, versionId } = req.params;
        const snapshot = await designVersionService.getVersionSnapshot(id, versionId);
        if (!snapshot) {
            return res.status(404).json({ error: "Version not found" });
        }
        res.json({ snapshot });
    } catch (error) {
        console.error("Lỗi lấy snapshot:", error);
        res.status(500).json({ error: "Lỗi lấy snapshot" });
    }
};

export const restoreDesignVersion = async (req: Request, res: Response) => {
    try {
        const { id, versionId } = req.params;
        const userId = (req as any).user?.id;
        await designVersionService.restoreVersion(id, versionId, userId);
        
        // Notify all connected clients to reload the design to sync the restored state
        if (globalIo) {
            revisionStore.evict(id);
            globalIo.to(`design:${id}`).emit('design-restored');
        }

        res.json({ message: "Khôi phục thành công" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi khôi phục phiên bản" });
    }
};

// ── TRASH BIN ────────────────────────────────────────────────────────────────

export const getTrashDesigns = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    try {
        // [FIX - Transfer Ownership Compatibility]
        // Sau Transfer Ownership, designs.user_id = Team Owner mới.
        // Người tạo gốc sẽ không thấy design của mình trong Trash nếu chỉ lọc theo user_id.
        //
        // Giải pháp: Thêm điều kiện OR với bảng design_history (nếu có) hoặc
        // dùng trường last_modified_by để track người tạo gốc.
        //
        // Hiện tại (trước Transfer Ownership): lọc theo user_id là đúng.
        // Sau Transfer Ownership: user_id đã đổi → dùng them OR last_modified_by
        // để đảm bảo người tạo gốc vẫn thấy design trong Trash của mình.
        const result = await db.query(
            `SELECT d.*,
                    u.name AS owner_name,
                    u.email AS owner_email
             FROM designs d
             LEFT JOIN users u ON u.id = d.user_id
             WHERE (d.user_id = $1 OR d.last_modified_by = $1)
               AND d.is_deleted = true
             ORDER BY d.deleted_at DESC NULLS LAST`,
            [userId]
        );
        res.json({ designs: result.rows });
    } catch { res.status(500).json({ error: 'Failed to fetch trash designs' }); }
};

export const emptyTrash = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    try {
        // [FIX - Immediate Quota Release]
        // Trước khi xóa cả lô, tính tổng dung lượng các assets clone gắn với
        // những design sắp bị xóa để hoàn trả quota ngay cho user.
        // GC sẽ tự dọn file vật lý lúc 2AM, nhưng quota được giải phóng ngay lập tức.

        // Bước 1: Lấy danh sách design_id trong Trash của user
        const trashDesigns = await db.query(
            `SELECT id FROM designs WHERE user_id = $1 AND is_deleted = true`,
            [userId]
        );

        if (trashDesigns.rows.length > 0) {
            const designIds = trashDesigns.rows.map((d: any) => d.id);

            // Bước 2: Tìm các asset clone thuộc các design này (Bản ghi B),
            // có file_size > 0 và là điều kiện cuối cùng trỏ tới file đó
            const orphanAssets = await db.query(
                `SELECT a.id, a.url, a.file_size, a.uploaded_by, a.team_id
                 FROM assets a
                 WHERE a.metadata->>'design_id' = ANY($1::text[])
                   AND a.metadata->>'design_clone' = 'true'
                   AND a.file_size > 0
                   AND NOT EXISTS (
                     SELECT 1 FROM assets a2
                     WHERE a2.url = a.url AND a2.id != a.id
                   )`,
                [designIds]
            );

            // Bước 3: Xóa các design trong trash
            await db.execute(
                'DELETE FROM designs WHERE user_id = $1 AND is_deleted = true',
                [userId]
            );

            // Bước 4: Gom tổng dung lượng theo từng chủ sở hữu, rồi UPDATE 1 lần mỗi nhóm.
            // [FIX Race Condition] Không dùng vòng for tuần tự (nếu 1 fail thì quota bị treo).
            // Thay bằng: aggregate Map → Promise.allSettled để các UPDATE chạy song song,
            // 1 cái fail không ảnh hưởng các cái khác. GC sẽ sync lại nếu vẫn còn lệch.

            // Gom bytes: key = "user:<id>" hoặc "team:<id>"
            const bytesByOwner = new Map<string, { type: 'user' | 'team'; id: string; bytes: number }>();
            for (const asset of orphanAssets.rows) {
                const bytes = Number(asset.file_size) || 0;
                if (bytes <= 0) continue;

                if (asset.team_id) {
                    const key = `team:${asset.team_id}`;
                    const existing = bytesByOwner.get(key);
                    if (existing) existing.bytes += bytes;
                    else bytesByOwner.set(key, { type: 'team', id: asset.team_id, bytes });
                } else if (asset.uploaded_by) {
                    const key = `user:${asset.uploaded_by}`;
                    const existing = bytesByOwner.get(key);
                    if (existing) existing.bytes += bytes;
                    else bytesByOwner.set(key, { type: 'user', id: asset.uploaded_by, bytes });
                }
            }

            // Chạy song song tất cả UPDATE, 1 fail không chặn cái khác
            const updatePromises = Array.from(bytesByOwner.values()).map(({ type, id, bytes }) => {
                if (type === 'team') {
                    return db.execute(
                        `UPDATE teams SET used_storage_bytes = GREATEST(0, COALESCE(used_storage_bytes, 0) - $1) WHERE id = $2`,
                        [bytes, id]
                    );
                } else {
                    return db.execute(
                        `UPDATE users SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) - $1) WHERE id = $2`,
                        [bytes, id]
                    );
                }
            });

            const results = await Promise.allSettled(updatePromises);
            results.forEach((result, i) => {
                if (result.status === 'rejected') {
                    const entry = Array.from(bytesByOwner.values())[i];
                    console.warn(`[EmptyTrash] Quota update fail for ${entry.type}:${entry.id}:`, result.reason);
                }
            });
        } else {
            // Trash đã trống sẵn
            await db.execute(
                'DELETE FROM designs WHERE user_id = $1 AND is_deleted = true',
                [userId]
            );
        }

        res.json({ message: 'Trash emptied' });
    } catch { res.status(500).json({ error: 'Failed to empty trash' }); }
};

export const restoreDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    // [FIX 4 - Trash RBAC] Authorization đã được checkTrashedDesignAccess + requireRole('owner') xử lý.
    // Không cần hard-code WHERE user_id = $2 nữa — tương thích với Transfer Ownership tương lai.
    try {
        await db.execute(
            'UPDATE designs SET is_deleted = false, deleted_at = NULL WHERE id = $1',
            [id]
        );
        res.json({ message: 'Design restored' });
    } catch { res.status(500).json({ error: 'Restore failed' }); }
};

export const permanentlyDeleteDesign = async (req: Request, res: Response) => {
    const { id } = req.params;
    // [FIX 4 - Trash RBAC] Authorization đã được checkTrashedDesignAccess + requireRole('owner') xử lý.
    // Không cần hard-code WHERE user_id = $2 nữa — tương thích với Transfer Ownership tương lai.
    try {
        await db.execute(
            'DELETE FROM designs WHERE id = $1 AND is_deleted = true',
            [id]
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
        const result = await db.query(
            'UPDATE designs SET is_deleted = true, deleted_at = NOW() WHERE id = ANY($1) AND user_id = $2 RETURNING id',
            [designIds, userId]
        );
        const deletedIds = result.rows.map(row => row.id);
        res.json({ message: 'Moved to trash', deletedIds });
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

// ── GET /api/templates ─────────────────────────────────────────────────────────
// Trả về danh sách tất cả design đã được Admin publish thành template công khai.
export const getPublicTemplates = async (_req: Request, res: Response) => {
    try {
        const result = await db.query(`
            SELECT
                d.id, d.title, d.description, d.design_type,
                d.width, d.height, d.thumbnail_url,
                pt.uses, pt.likes, pt.created_at AS published_at,
                tc.name AS category_name,
                u.name AS author_name
            FROM public_templates pt
            JOIN designs d ON d.id = pt.design_id
            JOIN users u ON u.id = d.user_id
            LEFT JOIN template_categories tc ON tc.id = pt.category_id
            WHERE d.is_deleted = false AND d.is_template = true
            ORDER BY pt.uses DESC, pt.created_at DESC
        `);
        res.json({ templates: result.rows });
    } catch (error) {
        console.error('[getPublicTemplates]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── POST /api/templates/:id/use ────────────────────────────────────────────────
// Clone toàn bộ template (design + pages + elements) sang user hiện tại.
// Template gốc KHÔNG thay đổi. User nhận được bản sao độc lập để chỉnh sửa.
export const useTemplate = async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const userId = (req as any).user?.id;
    const workspaceId = req.headers['x-workspace-id'] as string;
    const teamId = workspaceId && workspaceId !== 'personal' ? workspaceId : null;

    try {
        // 1. Kiểm tra template tồn tại và đã được publish
        const template = await db.getOne(
            `SELECT d.* FROM designs d
             JOIN public_templates pt ON pt.design_id = d.id
             WHERE d.id = $1 AND d.is_deleted = false AND d.is_template = true`,
            [templateId]
        );
        if (!template) return res.status(404).json({ error: 'Template không tồn tại' });

        // 2. Clone design — đổi user_id, xóa template flags
        const newDesignId = uuidv4();
        await db.execute(`
            INSERT INTO designs
                (id, user_id, team_id, folder_id, title, description, design_type,
                 width, height, thumbnail_url, is_public, is_template, is_deleted,
                 total_duration, created_at, updated_at)
            VALUES
                ($1, $2, $3, NULL, $4, $5, $6,
                 $7, $8, $9, false, false, false,
                 $10, NOW(), NOW())
        `, [
            newDesignId,
            userId,
            teamId,
            `${template.title} (Template)`,
            template.description,
            template.design_type,
            template.width,
            template.height,
            template.thumbnail_url,
            template.total_duration,
        ]);
        // 3. Clone từng trang (design_pages)
        const pages = await db.query(
            `SELECT * FROM design_pages WHERE design_id = $1 ORDER BY page_order`,
            [templateId]
        );

        const pageIdMap = new Map<string, string>(); // oldPageId → newPageId

        for (const page of pages.rows) {
            const newPageId = uuidv4();
            pageIdMap.set(page.id, newPageId);

            await db.execute(`
                INSERT INTO design_pages
                    (id, design_id, page_order, title, background_color,
                     duration, transition, thumbnail, type, width, height, content,
                     created_at, updated_at)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            `, [
                newPageId,
                newDesignId,
                page.page_order,
                page.title,
                page.background_color,
                page.duration,
                page.transition,
                page.thumbnail,
                page.type,
                page.width,
                page.height,
                page.content,
            ]);

            // 4. Clone elements cho từng trang
            const elements = await db.query(
                `SELECT * FROM design_elements WHERE page_id = $1`,
                [page.id]
            );
            for (const el of elements.rows) {
                const newElId = uuidv4();
                await db.execute(`
                    INSERT INTO design_elements
                        (id, page_id, element_type, z_index, locked, visible, properties, created_at, updated_at)
                    VALUES
                        ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                `, [
                    newElId,
                    newPageId,
                    el.element_type,
                    el.z_index,
                    el.locked,
                    el.visible,
                    el.properties,
                ]);
            }
        }

        // 5. Tăng bộ đếm uses
        await db.execute(
            `UPDATE public_templates SET uses = uses + 1 WHERE design_id = $1`,
            [templateId]
        );

        res.status(201).json({
            success: true,
            designId: newDesignId,
            message: 'Template đã được sao chép vào thiết kế của bạn!',
        });
    } catch (error) {
        console.error('[useTemplate]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
