import { TEST_DATABASE_URL } from "../../playwright.config";

// Points app-library imports (src/lib/db) at the test database and disables
// outbound email for specs that call server-side code directly.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.RESEND_API_KEY = "";
