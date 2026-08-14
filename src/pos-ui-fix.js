const FAVORITES_KEY = 'bazaar-pos-favorites';

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let lastProductSignature = '';
let updating = false;

const readFavorites = () => {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};

const writeFavorites = values => localStorage.setItem(FAVORITES_KEY, JSON.stringify(values.map(String)));

const productData = button => ({
  name: qs('strong', button)?.textContent?.trim() || 'سلعة',
  barcode: qs('small', button)?.textContent?.trim() || '',
  price: qs('span', button)?.textContent?.trim() || '',
  stock: qs('em', button)?.textContent?.trim() || ''
});

function ensureDefaultFavorites(products) {
  let favorites = readFavorites();
  if (!favorites.length && products.length) {
    favorites = products.slice(0, Math.min(6, products.length)).map(p => p.barcode).filter(Boolean);
    writeFavorites(favorites);
  }
  return favorites;
}

function injectFavoriteStyles() {
  if (document.getElementById('bazaar-favorites-fix')) return;
  const style = document.createElement('style');
  style.id = 'bazaar-favorites-fix';
  style.textContent = `
    .posFavorites{display:block!important;width:100%!important;box-sizing:border-box!important;margin:8px 0 10px!important;padding:8px!important;background:#fff!important;border:1px solid #dfe6f0!important;border-radius:10px!important;box-shadow:0 1px 3px rgba(16,35,61,.04)!important;direction:rtl!important}
    .posFavoritesHeader{display:flex!important;align-items:center!important;justify-content:space-between!important;height:30px!important;padding:0 4px 6px!important;margin:0 0 7px!important;border-bottom:1px solid #edf1f6!important;box-sizing:border-box!important}
    .posFavoritesHeader div{display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px!important}
    .posFavoritesHeader strong{font-size:15px!important;color:#17233a!important}
    .posFavoritesHeader small{font-size:10px!important;color:#7b8798!important}
    .posFavoritesHeader>span{font-size:16px!important;color:#ed1b68!important}
    .posFavoritesGrid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important;gap:6px!important;width:100%!important}
    .posFavoriteCard{position:relative!important;min-width:0!important;height:44px!important}
    .posFavoriteMain{width:100%!important;height:44px!important;min-height:44px!important;box-sizing:border-box!important;border:1px solid #e0e6ef!important;border-radius:7px!important;background:#fbfcff!important;color:#17233a!important;padding:4px 30px 4px 8px!important;text-align:right!important;font-family:inherit!important;cursor:pointer!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;grid-template-rows:1fr 1fr!important;align-items:center!important;column-gap:8px!important;row-gap:0!important}
    .posFavoriteMain:hover{border-color:#8db0e8!important;background:#fff!important}
    .posFavoriteMain strong{grid-column:1!important;grid-row:1/-1!important;font-size:13px!important;font-weight:800!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
    .posFavoriteMain small{grid-column:2!important;grid-row:1!important;font-size:9px!important;color:#7b8798!important;white-space:nowrap!important}
    .posFavoriteMain b{grid-column:3!important;grid-row:1/-1!important;font-size:12px!important;color:#145fd5!important;white-space:nowrap!important}
    .posFavoriteMain em{grid-column:2!important;grid-row:2!important;font-size:9px!important;color:#16845f!important;font-style:normal!important;white-space:nowrap!important}
    .posFavoriteStar{position:absolute!important;top:12px!important;right:7px!important;width:17px!important;height:17px!important;border:0!important;background:transparent!important;color:#ed1b68!important;font-size:13px!important;cursor:pointer!important;padding:0!important;z-index:3!important}
    .posFavoritesEmpty{grid-column:1/-1!important;text-align:center!important;color:#98a2b3!important;padding:10px!important}
    @media(max-width:900px){.posFavoritesGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:600px){.posFavoritesGrid{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

function createFavoriteCard(product, originalButton, onRemove) {
  const card = document.createElement('div');
  card.className = 'posFavoriteCard';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'posFavoriteMain';

  const name = document.createElement('strong');
  name.textContent = product.name;
  const barcode = document.createElement('small');
  barcode.textContent = product.barcode;
  const price = document.createElement('b');
  price.textContent = product.price;
  const stock = document.createElement('em');
  stock.textContent = product.stock;
  main.append(name, barcode, price, stock);
  main.addEventListener('click', () => originalButton.click());

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'posFavoriteStar';
  star.title = 'إزالة من المفضلة';
  star.textContent = '★';
  star.addEventListener('click', event => {
    event.stopPropagation();
    onRemove(product.barcode);
  });

  card.append(main, star);
  return card;
}

function updateProductArea() {
  if (updating) return;
  const results = qs('.productResults');
  const cartTable = qs('.cartTable');
  const search = qs('.posSearch input');
  if (!results || !cartTable || !search) return;

  const originals = qsa('.posProduct', results).filter(button => button.textContent.trim());
  const products = originals.map(productData).filter(p => p.barcode);
  const query = String(search.value || '').trim();
  const signature = `${query}|${products.map(p => `${p.barcode}:${p.name}:${p.price}:${p.stock}`).join('|')}`;

  if (signature === lastProductSignature) return;
  lastProductSignature = signature;

  updating = true;
  try {
    injectFavoriteStyles();
    let favoritesBox = qs('.posFavorites');
    if (!favoritesBox) {
      favoritesBox = document.createElement('section');
      favoritesBox.className = 'posFavorites';
      cartTable.parentNode.insertBefore(favoritesBox, cartTable.nextSibling);
    }

    if (query) {
      results.style.display = originals.length ? 'grid' : 'none';
      favoritesBox.style.display = 'none';
      return;
    }

    results.style.display = 'none';
    favoritesBox.style.display = 'block';

    const favorites = ensureDefaultFavorites(products);
    const favoriteSet = new Set(favorites);
    const favoriteOriginals = originals.filter(button => favoriteSet.has(productData(button).barcode));

    favoritesBox.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'posFavoritesHeader';
    const headerText = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'المفضلة';
    const hint = document.createElement('small');
    hint.textContent = 'إضافة سريعة للسلة';
    headerText.append(title, hint);
    const icon = document.createElement('span');
    icon.textContent = '★';
    header.append(headerText, icon);
    favoritesBox.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'posFavoritesGrid';
    if (!favoriteOriginals.length) {
      const empty = document.createElement('div');
      empty.className = 'posFavoritesEmpty';
      empty.textContent = 'لا توجد سلع مفضلة حاليًا';
      grid.appendChild(empty);
    } else {
      favoriteOriginals.forEach(original => {
        const data = productData(original);
        grid.appendChild(createFavoriteCard(data, original, barcode => {
          writeFavorites(readFavorites().filter(x => x !== String(barcode)));
          lastProductSignature = '';
          updateProductArea();
        }));
      });
    }
    favoritesBox.appendChild(grid);
  } finally {
    updating = false;
  }
}

function ensureCloseRail() {
  if (qs('.posSideRail')) return;
  const rail = document.createElement('aside');
  rail.className = 'posSideRail';
  rail.innerHTML = `<button type="button" class="posSideRailTab" aria-label="فتح قائمة نقطة البيع">☰</button><div class="posSideRailPanel"><div class="posSideRailTitle">نقطة البيع</div><button type="button" class="posRailPrintButton">طباعة الوصل</button><button type="button" class="posCloseButton">إغلاق نقطة البيع</button></div>`;
  document.body.appendChild(rail);
  qs('.posSideRailTab', rail).addEventListener('click', () => rail.classList.toggle('open'));
  qs('.posCloseButton', rail).addEventListener('click', () => window.close());
  qs('.posRailPrintButton', rail).addEventListener('click', () => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'bazaar-pos-open-print' }, '*');
      window.close();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !qs('.barcodeOverlay') && !qs('.invoiceOverlay')) rail.classList.remove('open');
  });
}

function run() {
  if (!qs('.posView')) return;
  injectFavoriteStyles();
  ensureCloseRail();
  lastProductSignature = '';
  updateProductArea();
}

const observer = new MutationObserver(() => {
  if (qs('.posView')) {
    ensureCloseRail();
    updateProductArea();
  }
});

window.addEventListener('input', event => {
  if (event.target?.matches?.('.posSearch input')) {
    lastProductSignature = '';
    requestAnimationFrame(updateProductArea);
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', run);
setTimeout(run, 300);
