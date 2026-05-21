import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { config } from '../config.js';
import { asyncHandler } from '../validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

export const uploadsRouter = Router();

uploadsRouter.post('/profile-image', verifyUser, upload.single('image'), asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  if (!profileId) return res.status(400).json({ error: 'profile_id is required' });
  if (!req.file) return res.status(400).json({ error: 'image file is required' });

  const { data: profile } = await supabaseAdmin.from('profiles').select('user_id, max_photos').eq('id', profileId).single();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (profile.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });

  const maxPhotos = Number(profile.max_photos || 6);
  const { data: existingImages, count, error: countError } = await supabaseAdmin
    .from('profile_images')
    .select('id', { count: 'exact' })
    .eq('profile_id', profileId);

  if (countError) return res.status(400).json({ error: countError.message });
  if ((count || 0) >= maxPhotos) {
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

  if (uploadResult.error) return res.status(400).json({ error: uploadResult.error.message });

  const isCover = (existingImages?.length || 0) === 0;
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .insert({ profile_id: profileId, storage_path: storagePath, is_primary: isCover, moderation_status: 'pending' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const { data: publicUrl } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
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

uploadsRouter.patch('/profile-image/:id/cover', verifyUser, asyncHandler(async (req, res) => {
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

uploadsRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum image size is 8 MB.' });
  }

  next(error);
});
