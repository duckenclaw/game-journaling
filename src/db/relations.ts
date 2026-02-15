import { relations } from "drizzle-orm";
import {
  games,
  studios,
  publishers,
  designers,
  gameDevelopers,
  gamePublishers,
  publisherStudios,
  relatedStudios,
} from "./schema.js";

// ── Game relations ──────────────────────────

export const gamesRelations = relations(games, ({ one, many }) => ({
  directorEntity: one(designers, {
    fields: [games.director],
    references: [designers.slug],
  }),
  developers: many(gameDevelopers),
  gamePublishers: many(gamePublishers),
}));

// ── Studio relations ────────────────────────

export const studiosRelations = relations(studios, ({ one, many }) => ({
  directorEntity: one(designers, {
    fields: [studios.director],
    references: [designers.slug],
  }),
  gameDevelopers: many(gameDevelopers),
  publisherStudios: many(publisherStudios),
  relatedStudiosFrom: many(relatedStudios),
}));

// ── Publisher relations ─────────────────────

export const publishersRelations = relations(publishers, ({ many }) => ({
  gamePublishers: many(gamePublishers),
  publisherStudios: many(publisherStudios),
}));

// ── Designer relations ──────────────────────

export const designersRelations = relations(designers, () => ({}));

// ── Junction table relations ────────────────

export const gameDevelopersRelations = relations(gameDevelopers, ({ one }) => ({
  game: one(games, {
    fields: [gameDevelopers.gameSlug],
    references: [games.slug],
  }),
  studio: one(studios, {
    fields: [gameDevelopers.studioSlug],
    references: [studios.slug],
  }),
}));

export const gamePublishersRelations = relations(gamePublishers, ({ one }) => ({
  game: one(games, {
    fields: [gamePublishers.gameSlug],
    references: [games.slug],
  }),
  publisher: one(publishers, {
    fields: [gamePublishers.publisherSlug],
    references: [publishers.slug],
  }),
}));

export const publisherStudiosRelations = relations(publisherStudios, ({ one }) => ({
  publisher: one(publishers, {
    fields: [publisherStudios.publisherSlug],
    references: [publishers.slug],
  }),
  studio: one(studios, {
    fields: [publisherStudios.studioSlug],
    references: [studios.slug],
  }),
}));

export const relatedStudiosRelations = relations(relatedStudios, ({ one }) => ({
  studio: one(studios, {
    fields: [relatedStudios.studioSlug],
    references: [studios.slug],
  }),
  relatedStudio: one(studios, {
    fields: [relatedStudios.relatedStudioSlug],
    references: [studios.slug],
  }),
}));
