package com.project.realtime._messaging_application.modules.Media.dto;

/**
 * Request tu client de xin upload signature.
 * Server dung fileType va fileSize de validate truoc khi cap signature.
 */
public record UploadSignatureRequest(

        /**
         * MIME type cua file: "image/jpeg", "image/png", "application/pdf", ...
         * Server dung de quyet dinh resourceType ("image" vs "raw").
         */
        String fileType,

        /**
         * Kich thuoc file tinh bang bytes.
         * Server check khong vuot qua cloudinary.max-file-size.
         */
        long fileSize,

        /**
         * Ten file goc de hien thi trong UI.
         * Khong dung lam public_id (tranh xung dot).
         */
        String fileName
) {}

