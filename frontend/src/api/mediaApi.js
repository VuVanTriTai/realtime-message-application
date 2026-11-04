import { apiRequest } from './client';

export const mediaApi = {
  /**
   * Lấy Cloudinary upload signature từ backend
   * @param {File} file 
   */
  getUploadSignature: async (file) => {
    return apiRequest('/media/upload-signature', {
      method: 'POST',
      body: JSON.stringify({
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileName: file.name,
      }),
    });
  },

  /**
   * Upload file trực tiếp lên Cloudinary bằng signature
   * @param {File} file
   * @param {Object} sigData Signature data từ getUploadSignature
   * @param {Function} onProgress (percent) => void (tùy chọn)
   */
  uploadToCloudinary: async (file, sigData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sigData.uploadUrl);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (err) {
            reject(new Error('Lỗi phản hồi từ dịch vụ lưu trữ media.'));
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText);
            reject(new Error(errRes.error?.message || 'Upload file thất bại.'));
          } catch {
            reject(new Error(`Upload thất bại với mã lỗi HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải tệp lên Cloudinary.'));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', sigData.apiKey);
      formData.append('timestamp', sigData.timestamp);
      formData.append('signature', sigData.signature);
      formData.append('folder', sigData.folder);

      xhr.send(formData);
    });
  },
};

