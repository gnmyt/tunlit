const path = require("node:path");

const dataDir = () => process.env.TUNLIT_DATA_DIR || path.join(process.cwd(), "data");

module.exports = { dataDir };
