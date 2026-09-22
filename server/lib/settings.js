const Setting = require("../models/Setting");

const read = async () => {
    const rows = await Setting.findAll();
    const values = {};
    for (const row of rows) {
        try {
            values[row.key] = JSON.parse(row.value);
        } catch {
            values[row.key] = row.value;
        }
    }
    return values;
};

const write = async values => {
    for (const [key, value] of Object.entries(values)) {
        const encoded = JSON.stringify(value);
        const row = await Setting.findOne({ where: { key } });
        if (row) await Setting.update({ value: encoded }, { where: { key } });
        else await Setting.create({ key, value: encoded });
    }
};

module.exports = { read, write };
