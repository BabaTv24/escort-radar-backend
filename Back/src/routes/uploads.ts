import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { requireAdvertiserAccess, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { config } from '../config.js';
import { asyncHandler } from '../validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

export const uploadsRouter = Router();

uploadsRouter.post('/client-avatar', verifyUser, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image file is required' });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
    return res.status(415).json({ error: 'Unsupported image format. Use JPG, PNG, or WEBP.' });
  }

  const processed = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 512, height: 512, fit: 'cover' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const storagePath = `client-avatars/${req.user!.id}/${crypto.randomUUID()}.jpg`;
  const uploadResult = await supabaseAdmin.storage
    .from(config.storageBucket)
    .upload(storagePath, processed, { contentType: 'image/jpeg', upsert: true });

  if (uploadResult.error) return res.status(400).json({ error: uploadResult.error.message });

  const { data: publicUrl } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
  const { data, error } = await supabaseAdmin
    .from('client_profiles')
    .upsert({
      user_id: req.user!.id,
      avatar_url: publicUrl.publicUrl,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ client_profile: data, avatar_url: publicUrl.publicUrl });
}));

uploadsRouter.post('/profile-image', verifyUser, requireAdvertiserAccess, upload.single('image'), asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  logUploadDebug('POST /api/uploads/profile-image start', req, {
    status: 'start',
    profile_id: profileId || null,
    storage_bucket: config.storageBucket,
    file_received: Boolean(req.file),
    file_mime: req.file?.mimetype || null,
    file_size: req.file?.size || null
  });
  if (!profileId) {
    logUploadDebug('POST /api/uploads/profile-image missing_profile_id', req, { status: 'error', storage_bucket: config.storageBucket });
    return res.status(400).json({ error: 'profile_id is required' });
  }
  if (!req.file) {
    logUploadDebug('POST /api/uploads/profile-image missing_file', req, { status: 'error', profile_id: profileId, storage_bucket: config.storageBucket });
    return res.status(400).json({ error: 'image file is required' });
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
    logUploadDebug('POST /api/uploads/profile-image unsupported_format', req, {
      status: 'error',
      profile_id: profileId,
      file_mime: req.file.mimetype,
      file_size: req.file.size,
      storage_bucket: config.storageBucket
    });
    return res.status(415).json({ error: 'Unsupported image format. Use JPG, PNG, or WEBP.' });
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('user_id, max_photos').eq('id', profileId).single();
  if (!profile) {
    logUploadDebug('POST /api/uploads/profile-image profile_not_found', req, { status: 'error', profile_id: profileId, storage_bucket: config.storageBucket });
    return res.status(404).json({ error: 'Profile not found' });
  }
  if (profile.user_id !== req.user!.id) {
    logUploadDebug('POST /api/uploads/profile-image forbidden', req, { status: 'error', profile_id: profileId, owner_id: profile.user_id, storage_bucket: config.storageBucket });
    return res.status(403).json({ error: 'Not your profile' });
  }

  const maxPhotos = Number(profile.max_photos || 6);
  const { data: existingImages, count, error: countError } = await supabaseAdmin
    .from('profile_images')
    .select('id', { count: 'exact' })
    .eq('profile_id', profileId);

  if (countError) {
    logUploadDebug('POST /api/uploads/profile-image count_error', req, { status: 'error', profile_id: profileId, supabase_error: countError.message, storage_bucket: config.storageBucket });
    return res.status(400).json({ error: countError.message });
  }
  if ((count || 0) >= maxPhotos) {
    logUploadDebug('POST /api/uploads/profile-image limit_reached', req, { status: 'error', profile_id: profileId, count, max_photos: maxPhotos, storage_bucket: config.storageBucket });
    return res.status(400).json({ error: `Photo limit reached. Premium listings include up to ${maxPhotos} photos.` });
  }

  const processed = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  const storagePath = `${req.user!.id}/${profileId}/${crypto.randomUUID()}.jpg`;
  const uploadResult = await supabaseAdmin.storage
    .from(config.storageBucket)
    .upload(storagePath, processed, { contentType: 'image/jpeg' });

  if (uploadResult.error) {
    const message = uploadResult.error.message.toLowerCase().includes('bucket')
      ? `Storage bucket "${config.storageBucket}" is missing or not accessible.`
      : uploadResult.error.message;
    logUploadDebug('POST /api/uploads/profile-image storage_error', req, {
      status: 'error',
      profile_id: profileId,
      storage_bucket: config.storageBucket,
      storage_path: storagePath,
      supabase_error: uploadResult.error.message
    });
    return res.status(400).json({ error: message });
  }

  const isCover = (existingImages?.length || 0) === 0;
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .insert({ profile_id: profileId, storage_path: storagePath, is_primary: isCover, moderation_status: 'pending' })
    .select()
    .single();

  if (error) {
    logUploadDebug('POST /api/uploads/profile-image insert_error', req, {
      status: 'error',
      profile_id: profileId,
      storage_bucket: config.storageBucket,
      storage_path: storagePath,
      supabase_error: error.message
    });
    return res.status(400).json({ error: error.message });
  }

  const { data: publicUrl } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
  logUploadDebug('POST /api/uploads/profile-image success', req, {
    status: 'success',
    profile_id: profileId,
    image_id: data.id,
    storage_bucket: config.storageBucket,
    storage_path: storagePath,
    public_url: publicUrl.publicUrl,
    file_mime: req.file.mimetype,
    file_size: req.file.size
  });
  res.status(201).json({
    image: {
      ...data,
      profile_id: profileId,
      public_url: publicUrl.publicUrl,
      is_cover: Boolean(data.is_primary),
      moderation_status: data.moderation_status || 'pending'
    }
  });
}));

uploadsRouter.patch('/profile-image/:id/cover', verifyUser, requireAdvertiserAccess, asyncHandler(async (req, res) => {
  const imageId = String(req.params.id || '');
  const { data: image, error: imageError } = await supabaseAdmin
    .from('profile_images')
    .select('*, profiles(user_id)')
    .eq('id', imageId)
    .single();

  if (imageError || !image) return res.status(404).json({ error: 'Image not found' });
  if ((image.profiles as any)?.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your image' });

  await supabaseAdmin.from('profile_images').update({ is_primary: false }).eq('profile_id', image.profile_id);
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .update({ is_primary: true })
    .eq('id', imageId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  const { data: publicUrl } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(data.storage_path);
  res.json({ image: { ...data, public_url: publicUrl.publicUrl, is_cover: true } });
}));

uploadsRouter.delete('/profile-image/:id', verifyUser, requireAdvertiserAccess, asyncHandler(async (req, res) => {
  const imageId = String(req.params.id || '');
  const { data: image, error: imageError } = await supabaseAdmin
    .from('profile_images')
    .select('*, profiles(user_id)')
    .eq('id', imageId)
    .single();

  if (imageError || !image) return res.status(404).json({ error: 'Image not found' });
  if ((image.profiles as any)?.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your image' });

  await supabaseAdmin.storage.from(config.storageBucket).remove([image.storage_path]);
  const { error } = await supabaseAdmin.from('profile_images').delete().eq('id', imageId);
  if (error) return res.status(400).json({ error: error.message });

  const { data: remaining } = await supabaseAdmin
    .from('profile_images')
    .select('*')
    .eq('profile_id', image.profile_id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (image.is_primary && remaining?.[0]) {
    await supabaseAdmin.from('profile_images').update({ is_primary: true }).eq('id', remaining[0].id);
  }

  res.status(204).send();
}));

uploadsRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum image size is 8 MB.' });
  }

  next(error);
});

function logUploadDebug(message: string, req: Request, extra: Record<string, unknown> = {}) {
  console.info('[uploads]', {
    message,
    user_id: req.user?.id || null,
    auth_account_type: req.user?.app_metadata?.auth_account_type || null,
    plan: req.user?.app_metadata?.plan || null,
    subscription_status: req.user?.app_metadata?.subscription_status || null,
    ...extra
  });
}
