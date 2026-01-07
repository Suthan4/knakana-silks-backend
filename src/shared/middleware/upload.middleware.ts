// import multer from "multer";

// /**
//  * Multer configuration for file uploads
//  */

// // Image upload (10MB limit)
// export const uploadImage = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype.startsWith("image/")) {
//       cb(null, true);
//     } else {
//       cb(new Error("Only images allowed"));
//     }
//   },
// });

// // Video upload (40MB limit)
// export const uploadVideo = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 40 * 1024 * 1024 }, // 40MB
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype.startsWith("video/")) {
//       cb(null, true);
//     } else {
//       cb(new Error("Only videos allowed"));
//     }
//   },
// });

// // Mixed upload (images + videos)
// export const uploadMixed = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 40 * 1024 * 1024 }, // 40MB
// });
