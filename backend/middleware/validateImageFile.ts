// backend/middleware/validateImageFile.ts
// [FIX Vấn đề 11] Magic Number File Validation
//
// Kiểm tra định dạng tệp thực tế bằng cách đọc các byte đầu tiên của buffer (Magic Numbers).
// Ngăn chặn kẻ tấn công đổi tên mã độc (.exe/.sh) thành .png để vượt qua bộ lọc MIME-Type.
//
// Magic Number Reference:
//   PNG:  89 50 4E 47 0D 0A 1A 0A
//   JPEG: FF D8 FF
//   WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)

import { Request, Response, NextFunction } from 'express';

// Kích thước tệp tối đa cho ảnh (10MB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Kiểm tra Magic Bytes của buffer để xác định định dạng ảnh thực tế.
 * Trả về true nếu file thực sự là PNG, JPEG, hoặc WEBP.
 */
function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;

  // PNG: bytes 0-7 = 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) return true;

  // JPEG: bytes 0-2 = FF D8 FF
  if (
    buffer[0] === 0xFF &&
    buffer[1] === 0xD8 &&
    buffer[2] === 0xFF
  ) return true;

  // WEBP: bytes 0-3 = "RIFF" và bytes 8-11 = "WEBP"
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50   // P
  ) return true;

  return false;
}

/**
 * Middleware kiểm duyệt tệp ảnh thumbnail:
 *  1. Kiểm tra tệp có được upload không
 *  2. Giới hạn kích thước ≤ 2MB
 *  3. Kiểm tra Magic Numbers để xác nhận định dạng ảnh thực tế
 */
export const validateImageFile = (req: Request, res: Response, next: NextFunction) => {
  const file = (req as any).file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Guard 1: Kích thước tệp
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({
      error: 'FileTooLarge',
      message: `Kích thước ảnh upload không được vượt quá 10MB. Kích thước hiện tại: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    });
  }

  // Guard 2: Magic Numbers — kiểm tra định dạng thực tế của file
  // Không tin tưởng vào Content-Type header hay file extension của client
  if (!file.buffer || !isValidImageBuffer(file.buffer)) {
    return res.status(415).json({
      error: 'UnsupportedMediaType',
      message: 'Định dạng tệp không hợp lệ. Chỉ chấp nhận ảnh PNG, JPEG hoặc WEBP.',
    });
  }

  next();
};
