const FAVORITES_KEY = 'bazaar-pos-favorites';

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function writeFavorites(values) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(values.map(String)));
}

function productData(button) {
  return {
    name: qs('strong', button)?.textContent?.trim() || 'سلعة',
    barcode: qs('small', button)?.textContent?.trim() || '',
    price: qs('span', button)?.textContent?.trim() || '',
    stock: qs('em', button)?.textContent?.trim() || ''
  };
}

function ensureDefaultFavorites(products) {
  let favorites = readFavorites();
  if (!favorites.length && products.length) {
    favorites = products.slice(0, Math.min(6, products.length)).map(p => p.barcode).filter(Boolean);
    writeFavorites(favorites);
  }
  return favorites;
}

function createFavoriteCard(product, originalButton, onRemove) {
  const card = document.createElement('div');
  card.className = 'posFavoriteCard';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'posFavoriteMain';
  main.innerHTML = `<strong>${product.name}</strong><small>${product.barcode}</small><b>${product.price}</b><em>${product.stock}</em>`;
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
  const results = qs('.productResults');
  const cartTable = qs('.cartTable');
  const search = qs('.posSearch input');
  if (!results || !cartTable || !search) return;

  let favoritesBox = qs('.posFavorites');
  if (!favoritesBox) {
    favoritesBox = document.createElement('section');
    favoritesBox.className = 'posFavorites';
    results.parentNode.insertBefore(favoritesBox, cartTable);
  }

  const originals = qsa('.posProduct', results).filter(button => button.textContent.trim());
  const products = originals.map(productData).filter(p => p.barcode);
  const query = String(search.value || '').trim();

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
  header.innerHTML = '<div><strong>المفضلة</strong><small>أضف السلعة للسلة بلمسة واحدة</small></div><span>★</span>';
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
        updateProductArea();
      }));
    });
  }
  favoritesBox.appendChild(grid);
}

function ensureCloseRail() {
  if (qs('.posSideRail')) return;

  const rail = document.createElement('aside');
  rail.className = 'posSideRail';
  rail.innerHTML = `
    <button type="button" class="posSideRailTab" aria-label="فتح قائمة نقطة البيع">☰</button>
    <div class="posSideRailPanel">
      <div class="posSideRailTitle">نقطة البيع</div>
      <button type="button" class="posCloseButton">إغلاق نقطة البيع</button>
    </div>`;
  document.body.appendChild(rail);

  qs('.posSideRailTab', rail).addEventListener('click', () => rail.classList.toggle('open'));
  qs('.posCloseButton', rail).addEventListener('click', () => window.close());

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !qs('.barcodeOverlay') && !qs('.invoiceOverlay')) {
      rail.classList.remove('open');
    }
  });
}

function run() {
  if (!qs('.posView')) return;
  ensureCloseRail();
  updateProductArea();
}

const observer = new MutationObserver(() => {
  if (qs('.posView')) {
    ensureCloseRail();
    updateProductArea();
  }
});

window.addEventListener('input', event => {
  if (event.target?.matches?.('.posSearch input')) requestAnimationFrame(updateProductArea);
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', run);
setTimeout(run, 300);
