import sharp from "sharp";
import { AppError } from "./errors.js";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 10;
export interface ProcessedImage { full: Buffer; thumb: Buffer; width: number; height: number }
export interface ImageProcessor { process(input: Buffer): Promise<ProcessedImage> }

/**
 * Validates by decoding (not by trusting filename or Content-Type), strips metadata (EXIF/GPS),
 * auto-rotates, resizes to <=1280px and generates a 720px thumbnail (sharp on phone cards). Output is always WebP.
 */
export const sharpProcessor: ImageProcessor = {
  async process(input) {
    try {
      const base = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
      const meta = await base.metadata();
      if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error("format");
      const full = await base.clone().rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const thumb = await sharp(full.data).resize({ width: 720, height: 720, fit: "inside" }).webp({ quality: 80 }).toBuffer();
      return { full: full.data, thumb, width: full.info.width, height: full.info.height };
    } catch {
      throw new AppError(415, "INVALID_IMAGE", "Upload a valid JPG, PNG or WebP image (max 8 MB, under 40 megapixels).");
    }
  },
};
