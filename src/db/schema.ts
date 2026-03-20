import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  civicUserId: varchar('civic_user_id', { length: 255 }).unique().notNull(),
  email: varchar('email', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const photographerProfiles = pgTable('photographer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  portfolioUrl: text('portfolio_url'),
  name: varchar('name', { length: 255 }),
  bio: text('bio'),
  location: varchar('location', { length: 255 }),
  latitude: text('latitude'),
  longitude: text('longitude'),
  specialties: jsonb('specialties').$type<string[]>().default([]),
  style: text('style'),
  equipment: jsonb('equipment').$type<string[]>().default([]),
  priceRange: varchar('price_range', { length: 50 }),
  yearsExperience: integer('years_experience'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  googlePlaceId: varchar('google_place_id', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  category: varchar('category', { length: 255 }),
  website: text('website'),
  phone: varchar('phone', { length: 50 }),
  socialMedia: jsonb('social_media')
    .$type<Record<string, string>>()
    .default({}),
  description: text('description'),
  rating: text('rating'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  businessId: uuid('business_id')
    .references(() => businesses.id)
    .notNull(),
  // pending | approved | denied | sent
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  fitScore: integer('fit_score'),
  fitReason: text('fit_reason'),
  emailSubject: text('email_subject'),
  emailBody: text('email_body'),
  denialReason: text('denial_reason'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
