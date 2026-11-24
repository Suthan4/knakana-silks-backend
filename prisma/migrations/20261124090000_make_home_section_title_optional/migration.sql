-- Allow homepage sections to omit their display title.
ALTER TABLE "home_sections" ALTER COLUMN "title" DROP NOT NULL;
