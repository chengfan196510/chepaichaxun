import { pgTable, serial, timestamp, varchar, text, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const vehicleInfos = pgTable(
	"vehicle_infos",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		owner_name: varchar("owner_name", { length: 100 }).notNull(),
		license_plate: varchar("license_plate", { length: 20 }).notNull().unique(),
		phone: varchar("phone", { length: 20 }),
		department: varchar("department", { length: 100 }),
		description: text("description"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("vehicle_infos_license_plate_idx").on(table.license_plate),
		index("vehicle_infos_owner_name_idx").on(table.owner_name),
	]
);
