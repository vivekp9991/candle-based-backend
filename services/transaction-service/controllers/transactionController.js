const Transaction = require('../../../shared/models/Transaction');

async function createTransaction(req, res) {
  const tx = new Transaction(req.body);
  await tx.save();
  res.json(tx);
}

module.exports = { createTransaction };