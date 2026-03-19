const { z } = require('zod');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Geçersiz ObjectId');

const followSchema = z.object({
  followingId: objectIdSchema,
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  bio: z.string().max(150).optional(),
  interests: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  photos: z.array(z.string().trim().min(1).max(2_000_000)).max(3).optional(),
  gender: z.string().trim().max(50).optional(),
  birthDate: z.string().trim().max(20).optional(),
  avatarBase64: z.string().max(2_000_000).optional(),
});

const getUserStatusSchema = z.array(objectIdSchema).max(100);

module.exports = {
  objectIdSchema,
  followSchema,
  updateProfileSchema,
  getUserStatusSchema,
};
