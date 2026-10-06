"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const decimal_1 = require("../domain/decimal");
const router = (0, express_1.Router)();
router.get('/', (req, res, next) => {
    try {
        const items = database_1.db.prepare('SELECT id, name, hsn_code as hsnCode, unit_price as unitPrice, default_tax_rate as defaultTaxRate FROM items ORDER BY name ASC').all();
        res.status(200).json(items.map(item => ({
            ...item,
            unitPrice: (0, decimal_1.numVal)(item.unitPrice),
            defaultTaxRate: (0, decimal_1.numVal)(item.defaultTaxRate)
        })));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
