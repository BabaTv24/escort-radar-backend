import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import {
  funPageAdvertisementSettingKey,
  funPageAdvertisementStoragePrefix,
  createEmptyFunPageAdvertisement,
  isAdvertisementStoragePath,
  maxFunPageAdvertisements,
  normalizeFunPageAdvertisementSettings,
  reorderAdvertisements,
  toPublicFunPagePromotions,
  validateAdvertisementInput,
  validatePromotionsConfiguration,
  type AdvertisementImage,
  type FunPageAdvertisementSettings
} from '../funPageAdvertisement.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { writeAdminAuditLog } from '../services/adminAudit.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const advertisementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    callback(null, true);
  }
});

export const publicFunPageAdvertisementRouter = Router();
export const adminFunPageAdvertisementRouter = Router();

publicFunPageAdvertisementRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(toPublicFunPagePromotions(await readSettings()));
}));

adminFunPageAdvertisementRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ settings: await readSettings() });
}));

adminFunPageAdvertisementRouter.post('/advertisements', asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (settings.advertisements.length >= maxFunPageAdvertisements) return res.status(400).json({ error: `A maximum of ${maxFunPageAdvertisements} advertisements is supported` });
  const advertisement = createEmptyFunPageAdvertisement(settings.advertisements.length);
  const saved = await saveSettings({ ...settings, advertisements: [...settings.advertisements, advertisement] });
  await audit(req, 'funpage_advertisement_created', { advertisement_id: advertisement.id });
  res.status(201).json({ advertisement, settings: saved });
}));

adminFunPageAdvertisementRouter.patch('/advertisements/:id', advertisementUpload.single('image'), asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const index = settings.advertisements.findIndex((advertisement) => advertisement.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Advertisement not found' });
  let input: unknown;
  try {
    input = JSON.parse(String(req.body.settings || '{}'));
  } catch {
    return res.status(400).json({ error: 'settings must contain valid JSON' });
  }
  const validated = validateAdvertisementInput(input);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const current = settings.advertisements[index];
  let image = current.image;
  let uploadedPath: string | null = null;
  try {
    if (req.file) {
      image = await uploadAdvertisementImage(req.file, current.id);
      uploadedPath = image.storagePath;
    }
    const advertisement = { ...current, ...validated.value, image };
    const advertisements = settings.advertisements.map((item, itemIndex) => itemIndex === index ? advertisement : item);
    const saved = await saveSettings({ ...settings, advertisements });
    await audit(req, 'funpage_advertisement_updated', { advertisement_id: current.id, image_changed: Boolean(req.file), active: advertisement.active });
    if (
      req.file
      && current.image?.storagePath
      && current.image.storagePath !== image?.storagePath
      && isAdvertisementStoragePath(current.image.storagePath)
      && !isImageUsedElsewhere(saved, current.image.storagePath, current.id)
    ) {
      const removal = await supabaseAdmin.storage.from(config.storageBucket).remove([current.image.storagePath]);
      if (removal.error) return res.status(200).json({ advertisement, settings: saved, warning: `Advertisement saved, but the old image could not be removed: ${removal.error.message}` });
    }
    res.json({ advertisement, settings: saved });
  } catch (error) {
    if (uploadedPath) await supabaseAdmin.storage.from(config.storageBucket).remove([uploadedPath]).catch(() => undefined);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Advertisement could not be saved' });
  }
}));

adminFunPageAdvertisementRouter.delete('/advertisements/:id/image', asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const current = settings.advertisements.find((advertisement) => advertisement.id === req.params.id);
  if (!current) return res.status(404).json({ error: 'Advertisement not found' });
  if (!current.image) return res.status(404).json({ error: 'Advertisement image not found' });
  const storagePath = current.image.storagePath;
  const advertisements = settings.advertisements.map((advertisement) => advertisement.id === current.id ? { ...advertisement, image: null } : advertisement);
  const saved = await saveSettings({ ...settings, advertisements });
  await audit(req, 'funpage_advertisement_image_deleted', { advertisement_id: current.id });
  if (isAdvertisementStoragePath(storagePath) && !isImageUsedElsewhere(saved, storagePath, current.id)) {
    const removal = await supabaseAdmin.storage.from(config.storageBucket).remove([storagePath]);
    if (removal.error) return res.status(500).json({ error: `Image setting was removed, but storage deletion failed: ${removal.error.message}` });
  }
  res.json({ settings: saved });
}));

adminFunPageAdvertisementRouter.delete('/advertisements/:id', asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const current = settings.advertisements.find((advertisement) => advertisement.id === req.params.id);
  if (!current) return res.status(404).json({ error: 'Advertisement not found' });
  const advertisements = settings.advertisements.filter((advertisement) => advertisement.id !== current.id).map((advertisement, position) => ({ ...advertisement, position }));
  const saved = await saveSettings({ ...settings, advertisements });
  await audit(req, 'funpage_advertisement_deleted', { advertisement_id: current.id });
  const storagePath = current.image?.storagePath;
  if (storagePath && isAdvertisementStoragePath(storagePath) && !isImageUsedElsewhere(saved, storagePath, current.id)) {
    const removal = await supabaseAdmin.storage.from(config.storageBucket).remove([storagePath]);
    if (removal.error) return res.status(500).json({ error: `Advertisement was deleted, but image storage deletion failed: ${removal.error.message}` });
  }
  res.json({ settings: saved });
}));

adminFunPageAdvertisementRouter.put('/order', asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const reordered = reorderAdvertisements(settings, req.body.advertisement_ids);
  if (!reordered.ok) return res.status(400).json({ error: reordered.error });
  const saved = await saveSettings({ ...settings, advertisements: reordered.value });
  await audit(req, 'funpage_advertisements_reordered', { advertisement_ids: reordered.value.map((advertisement) => advertisement.id) });
  res.json({ settings: saved });
}));

adminFunPageAdvertisementRouter.patch('/configuration', asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const validated = validatePromotionsConfiguration(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const saved = await saveSettings({ ...settings, ...validated.value });
  await audit(req, 'funpage_promotions_configuration_updated', {
    rotation_interval_seconds: saved.rotationIntervalSeconds,
    ticker_active: saved.ticker.active,
    ticker_speed: saved.ticker.speed
  });
  res.json({ settings: saved });
}));

adminFunPageAdvertisementRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum image size is 8 MB.' });
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(415).json({ error: 'Unsupported image format. Use JPG, PNG, or WEBP.' });
  }
  next(error);
});

async function readSettings() {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', funPageAdvertisementSettingKey).maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeFunPageAdvertisementSettings(data?.value);
}

async function saveSettings(settings: FunPageAdvertisementSettings) {
  const value = { ...settings, version: 2 as const, updatedAt: new Date().toISOString() };
  const { error } = await supabaseAdmin.from('app_settings').upsert({ key: funPageAdvertisementSettingKey, value, updated_at: value.updatedAt }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return value;
}

async function uploadAdvertisementImage(file: Express.Multer.File, advertisementId: string): Promise<AdvertisementImage> {
  const processed = await sharp(file.buffer).rotate().resize({ width: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const storagePath = `${funPageAdvertisementStoragePrefix}${advertisementId}/${crypto.randomUUID()}.webp`;
  const upload = await supabaseAdmin.storage.from(config.storageBucket).upload(storagePath, processed, { contentType: 'image/webp' });
  if (upload.error) throw new Error(upload.error.message);
  const { data } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

function isImageUsedElsewhere(settings: FunPageAdvertisementSettings, storagePath: string, excludedId: string) {
  return settings.advertisements.some((advertisement) => advertisement.id !== excludedId && advertisement.image?.storagePath === storagePath);
}

async function audit(req: Request, action: string, details: Record<string, unknown>) {
  await writeAdminAuditLog(req.user?.email, action, 'app_settings', funPageAdvertisementSettingKey, details);
}
