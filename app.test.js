const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement() {
  return {
    value: '',
    style: {},
    classList: { toggle() {} },
    children: [],
    appendChild(child) { this.children.push(child); },
    setAttribute() {},
    focus() {},
    addEventListener() {},
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') this.children = [];
    },
    get innerHTML() { return this._innerHTML || ''; }
  };
}

test('mọi mã sản phẩm đều được gửi tới webhook', async () => {
  const elements = {
    productCode: createElement(),
    'product-image': createElement(),
    'product-price': createElement(),
    'location-info': createElement(),
    'size-list': createElement(),
    'product-title': createElement(),
    backButton: createElement()
  };
  elements.productCode.value = 'A123';

  const requestedCodes = [];
  const context = {
    AbortController,
    console,
    document: {
      readyState: 'complete',
      addEventListener() {},
      createElement,
      getElementById(id) { return elements[id] || null; }
    },
    fetch: async (_url, options) => {
      requestedCodes.push(JSON.parse(options.body).productCode);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ found: false })
      };
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    setInterval() { return 0; },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    Worker: class Worker {
      postMessage() {}
    }
  };
  context.window = context;
  vm.createContext(context);

  const root = __dirname;
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scriptSources = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(match => match[1]);

  for (const scriptSource of scriptSources) {
    vm.runInContext(fs.readFileSync(path.join(root, scriptSource), 'utf8'), context);
  }

  await context.window.searchProduct();

  assert.deepEqual(requestedCodes, ['A123']);
});

test('giao diện không còn thông báo chặn live', () => {
  const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  assert.doesNotMatch(appSource, /Không thể live|không live được|đã đóng vào bao/i);
});
