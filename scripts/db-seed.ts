import { seedDatabase, TEST_PASSWORD } from "@/lib/db/seed";

console.log(JSON.stringify({ ...seedDatabase(), password: TEST_PASSWORD, fictitious: true }, null, 2));
