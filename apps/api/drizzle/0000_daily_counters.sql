CREATE TABLE "daily_counters" (
	"day" date PRIMARY KEY NOT NULL,
	"creates" integer DEFAULT 0 NOT NULL,
	"reveals" integer DEFAULT 0 NOT NULL,
	"burns" integer DEFAULT 0 NOT NULL,
	"expiries" integer DEFAULT 0 NOT NULL
);
