import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024,
  },
});

export const singleImageUpload = upload.single('file');
