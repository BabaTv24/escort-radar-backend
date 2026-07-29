import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import {
  emptyFunPageAdvertisement,
  funPageAdvertisementSettingKey,
  funPageAdvertisementStoragePrefix,
  isAdvertisementStoragePath,
  normalizeFunPageAdvertisement,
  toPublicFunPageAdvertisement,
  validateFunPageAdvertisementInput,
  type AdvertisementImage,
  type FunPageAdvertisement
} from '../funPageAdvertisement.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { writeAdminAuditLog } from '../services/adminAudit.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const advertisementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    callback(null, true);
  }
});

export const publicFunPageAdvertisementRouter = Router();
export const adminFunPageAdvertisementRouter = Router();

publicFunPageAdvertisementRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ advertisement: toPublicFunPageAdvertisement(await readAdvertisement()) });
}));

adminFunPageAdvertisementRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ advertisement: await readAdvertisement() });
}));

adminFunPageAdvertisementRouter.post(
  '/',
  advertisementUpload.fields([{ name: 'desktopImage', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 }]),
  asyncHandler(async (req, res) => {
    let rawSettings: unknown;
    try {
      rawSettings = JSON.parse(String(req.body.settings || '{}'));
    } catch {
      return res.status(400).json({ error: 'settings must contain valid JSON' });
    }
    const validated = validateFunPageAdvertisementInput(rawSettings);
    if (!validated.ok) return res.status(400).json({ error: validated.error });

    const current = await readAdvertisement();
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const uploadedPaths: string[] = [];
    let desktopImage = current.desktopImage;
    let mobileImage = current.mobileImage;

    try {
      if (files.desktopImage?.[0]) {
        desktopImage = await uploadAdvertisementImage(files.desktopImage[0], 'desktop');
        uploadedPaths.push(desktopImage.storagePath);
      }
      if (files.mobileImage?.[0]) {
        mobileImage = await uploadAdvertisementImage(files.mobileImage[0], 'mobile');
        uploadedPaths.push(mobileImage.storagePath);
      }
      const advertisement: FunPageAdvertisement = { ...validated.value, desktopImage, mobileImage, updatedAt: new Date().toISOString() };
      const { error } = await supabaseAdmin.from('app_settings')
        .upsert({ key: funPageAdvertisementSettingKey, value: advertisement, updated_at: advertisement.updatedAt }, { onConflict: 'key' });
      if (error) throw new Error(error.message);
      await writeAdminAuditLog(req.user?.email, 'funpage_advertisement_updated', 'app_settings', funPageAdvertisementSettingKey, {
        active: advertisement.active,
        desktop_image_changed: Boolean(files.desktopImage?.[0]),
        mobile_image_changed: Boolean(files.mobileImage?.[0]),
        has_target_url: Boolean(advertisement.targetUrl),
        starts_at: advertisement.startsAt,
        ends_at: advertisement.endsAt
      });

      const replacedPaths = [
        files.desktopImage?.[0] ? current.desktopImage?.storagePath : null,
        files.mobileImage?.[0] ? current.mobileImage?.storagePath : null
      ].filter((path): path is string => Boolean(path && isAdvertisementStoragePath(path)));
      if (replacedPaths.length) {
        const removal = await supabaseAdmin.storage.from(config.storageBucket).remove(replacedPaths);
        if (removal.error) return res.status(200).json({ advertisement, warning: `Settings saved, but an old image could not be removed: ${removal.error.message}` });
      }
      res.json({ advertisement });
    } catch (error) {
      if (uploadedPaths.length) await supabaseAdmin.storage.from(config.storageBucket).remove(uploadedPaths).catch(() => undefined);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Advertisement settings could not be saved' });
    }
  })
);

adminFunPageAdvertisementRouter.delete('/:variant', asyncHandler(async (req, res) => {
  const variant = req.params.variant;
  if (variant !== 'desktop' && variant !== 'mobile') return res.status(400).json({ error: 'Unknown advertisement image variant' });
  const current = await readAdvertisement();
  const image = variant === 'desktop' ? current.desktopImage : current.mobileImage;
  if (!image) return res.status(404).json({ error: 'Advertisement image not found' });

  const advertisement: FunPageAdvertisement = {
    ...current,
    [variant === 'desktop' ? 'desktopImage' : 'mobileImage']: null,
    updatedAt: new Date().toISOString()
  };
  const { error } = await supabaseAdmin.from('app_settings')
    .upsert({ key: funPageAdvertisementSettingKey, value: advertisement, updated_at: advertisement.updatedAt }, { onConflict: 'key' });
  if (error) return res.status(400).json({ error: error.message });
  await writeAdminAuditLog(req.user?.email, 'funpage_advertisement_image_deleted', 'app_settings', funPageAdvertisementSettingKey, { variant });

  if (isAdvertisementStoragePath(image.storagePath)) {
    const removal = await supabaseAdmin.storage.from(config.storageBucket).remove([image.storagePath]);
    if (removal.error) return res.status(500).json({ error: `Image setting was removed, but storage deletion failed: ${removal.error.message}` });
  }
  res.json({ advertisement });
}));

adminFunPageAdvertisementRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum image size is 8 MB.' });
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(415).json({ error: 'Unsupported image format. Use JPG, PNG, or WEBP.' });
  }
  next(error);
});

async function readAdvertisement() {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value')
    .eq('key', funPageAdvertisementSettingKey).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeFunPageAdvertisement(data.value) : { ...emptyFunPageAdvertisement };
}

async function uploadAdvertisementImage(file: Express.Multer.File, variant: 'desktop' | 'mobile'): Promise<AdvertisementImage> {
  const processed = await sharp(file.buffer).rotate()
    .resize({ width: variant === 'desktop' ? 2400 : 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 }).toBuffer();
  const storagePath = `${funPageAdvertisementStoragePrefix}${variant}/${crypto.randomUUID()}.webp`;
  const upload = await supabaseAdmin.storage.from(config.storageBucket)
    .upload(storagePath, processed, { contentType: 'image/webp' });
  if (upload.error) throw new Error(upload.error.message);
  const { data } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}
