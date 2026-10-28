function normaliza(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function slugify(s) {
  return normaliza(s).replace(/\s+/g, "-");
}

module.exports = { normaliza, slugify };
