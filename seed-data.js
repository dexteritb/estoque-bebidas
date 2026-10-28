// Catálogos iniciais — vindos das tabelas de preço enviadas pelo COPAS.
// Reajuste aqui se os preços mudarem; isso só é usado no primeiro start
// (quando o banco de dados ainda não existe), depois disso é tudo
// gerenciado pela tela de administração.

const saborei = [
  ["Água 1,5L", 6.00], ["Água 500ml", 4.00], ["Água Com Gás 500ml", 5.00], ["Água Tônica", 8.00],
  ["Água Tônica Schweppes", 8.00], ["Budweser", 10.00], ["Coca Cola 1L", 12.00], ["Coca Cola 2L", 18.00],
  ["Coca Cola 600ml", 9.00], ["Coca Cola Ks", 6.00], ["Coca Cola Ks Zero", 6.00], ["Coca Cola Lata", 6.00],
  ["Coca Cola Ls 1L Vidro", 12.00], ["Coca Cola Zero 2L", 18.00], ["Coca Cola Zero Lata", 6.00], ["Fanta Ks", 6.00],
  ["Fanta Laranja 1L", 12.00], ["Fanta Laranja 2L", 18.00], ["Fanta Laranja Lata", 6.00], ["Fanta Uva 2L", 18.00],
  ["Fanta Uva Lata", 6.00], ["Guaraná 1L", 12.00], ["Guaraná 2L", 18.00], ["Guaraná Lata", 6.00],
  ["Guaraná Zero Lata", 6.00], ["Heineken", 12.00], ["Império", 10.00], ["Sprite Lata Zero", 6.00],
  ["Sprite Lata", 6.00], ["Sprite Lemon Fresh", 9.00], ["Tuchaua Ks", 6.00],
];

const holyburger = [
  ["Água 500ml", 4.00], ["Água Com Gás 500ml", 5.00], ["Água 1,5L", 6.00], ["Água Tônica", 6.00],
  ["Balde De Gelo G", 5.00], ["Balde De Gelo P", 3.00], ["Budweiser", 10.00], ["Chopp", 10.00],
  ["Coca 1L", 12.00], ["Coca Cola 2L", 18.00], ["Coca Ks", 6.00], ["Coca Ks Zero", 6.00], ["Coca Lata", 6.00],
  ["Coca Ls", 12.00], ["Coca Ls Zero 1L", 12.00], ["Coca Zero 2L", 18.00], ["Coca Zero Lata", 6.00],
  ["Coronita", 10.00], ["Cozu Mel", 8.00], ["Cozu Mel Pequeno", 3.00], ["Cozumel De Heineken", 18.00],
  ["Eisenbahn", 10.00], ["Energético", 15.00], ["Fanta Ks", 4.00], ["Fanta Ks 1L", 12.00],
  ["Fanta Laranja Lata", 6.00], ["Fanta Uva", 6.00], ["Garrafa De Cachaça", 50.00], ["Guaraná 1L", 12.00],
  ["Guaraná 2L", 18.00], ["Guaraná Antarctica", 6.00], ["Guaraná Tuchau 2L", 18.00], ["Guaraná Tuchaua Ks", 6.00],
  ["Heineken", 12.00], ["Heineken Pequena", 10.00], ["Império", 10.00], ["Limão E Sal", 4.00], ["Rolha", 100.00],
  ["Schueppes", 6.00], ["Smirnoff Grande", 130.00], ["Smirnoff Pequena", 75.00], ["Stella", 10.00],
];

module.exports = { saborei, holyburger };
