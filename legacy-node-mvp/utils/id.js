const crypto = require("node:crypto");

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function token(prefix = "tok") {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

module.exports = {
  id,
  token
};
