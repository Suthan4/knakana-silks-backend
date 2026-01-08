import express from "express";
import multer from "multer";
import { CommonController } from "../controller/s3.controller.js";

const router = express.Router();
const commonController = new CommonController();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images and videos are allowed!"));
    }
  },
});

/**
 * Upload single file
 * POST /api/upload
 */
router.post("/upload", upload.single("file"), commonController.uploadFile);

/**
 * Upload multiple files
 * POST /api/upload/multiple
 */
router.post(
  "/upload/multiple",
  upload.array("files", 10),
  commonController.uploadFiles
);

/**
 * Delete single file
 * DELETE /api/upload
 */
router.delete("/upload", commonController.deleteFile);

/**
 * Delete multiple files
 * DELETE /api/upload/multiple
 */
router.delete("/upload/multiple", commonController.deleteFiles);

export default router;
