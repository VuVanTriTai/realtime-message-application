/**
 * imageCompressor.js
 * Tiện ích nén và tối ưu hóa hình ảnh tại Client trước khi tải lên Cloudinary.
 *
 * Tính năng:
 *  - Thu nhỏ (resize) ảnh về kích thước chuẩn chat (Full HD: tối đa 1920x1920)
 *  - Giữ nguyên tỉ lệ khung hình (aspect ratio)
 *  - Nén chất lượng 82% (mắt thường trên màn hình chat nhìn vẫn nét căng)
 *  - Tự động bỏ qua tệp GIF (để giữ nguyên hoạt ảnh animation)
 *  - Tự động bỏ qua ảnh nhỏ hơn 250 KB (không cần nén thêm)
 *  - Nếu sau khi nén mà dung lượng không giảm, giữ nguyên ảnh gốc
 *  - Chạy nhanh trong ~30-80ms bằng HTML5 Canvas gốc, không phụ thuộc thư viện ngoài
 */

/**
 * Nén tệp hình ảnh
 * @param {File} file - File ảnh gốc được chọn từ input
 * @param {Object} options - Tùy chọn cấu hình
 * @param {number} options.maxWidth - Chiều rộng tối đa (mặc định 1920)
 * @param {number} options.maxHeight - Chiều cao tối đa (mặc định 1920)
 * @param {number} options.quality - Chất lượng nén 0.1 - 1.0 (mặc định 0.82)
 * @param {number} options.minSizeToCompress - Kích thước tối thiểu để kích hoạt nén (mặc định 250 KB)
 * @returns {Promise<{ file: File, wasCompressed: boolean, originalSize: number, compressedSize: number }>}
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    minSizeToCompress = 250 * 1024, // 250 KB
  } = options;

  const originalSize = file?.size || 0;

  // 1. Không phải file ảnh hoặc không tồn tại
  if (!file || !file.type.startsWith('image/')) {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  // 2. Ảnh GIF có thể có animation hoặc SVG là vector -> giữ nguyên
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  // 3. Ảnh đã nhỏ hơn ngưỡng tối thiểu -> không cần nén
  if (originalSize <= minSizeToCompress) {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // Tính toán kích thước mới giữ nguyên tỉ lệ
          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ file, wasCompressed: false, originalSize, compressedSize: originalSize });
            return;
          }

          // Cải thiện độ mịn khi vẽ thu nhỏ
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Định dạng đầu ra: giữ webp nếu gốc là webp, còn lại xuất jpeg
          const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= originalSize) {
                // Nếu sau khi nén dung lượng lớn hơn hoặc lỗi, giữ nguyên file gốc
                resolve({ file, wasCompressed: false, originalSize, compressedSize: originalSize });
                return;
              }

              // Đổi đuôi mở rộng sang .jpg nếu chuyển từ png/bmp sang jpeg
              let newFileName = file.name;
              if (outputType === 'image/jpeg' && !newFileName.match(/\.(jpg|jpeg)$/i)) {
                newFileName = newFileName.replace(/\.[^/.]+$/, '') + '.jpg';
              }

              const compressedFile = new File([blob], newFileName, {
                type: outputType,
                lastModified: Date.now(),
              });

              resolve({
                file: compressedFile,
                wasCompressed: true,
                originalSize,
                compressedSize: blob.size,
              });
            },
            outputType,
            quality
          );
        } catch (err) {
          console.warn('[imageCompressor] Lỗi khi xử lý canvas:', err);
          resolve({ file, wasCompressed: false, originalSize, compressedSize: originalSize });
        }
      };

      img.onerror = () => {
        resolve({ file, wasCompressed: false, originalSize, compressedSize: originalSize });
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      resolve({ file, wasCompressed: false, originalSize, compressedSize: originalSize });
    };

    reader.readAsDataURL(file);
  });
}
