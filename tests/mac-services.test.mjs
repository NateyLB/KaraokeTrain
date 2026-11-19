import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceNodePath } from '../tools/mac-services.mjs';

test('Mac launch agents do not pin the Node Cellar version that broke after a Homebrew update', () => {
  assert.equal(serviceNodePath('/opt/homebrew/Cellar/node/26.10.0_2/bin/node'), '/opt/homebrew/opt/node/bin/node');
  assert.equal(serviceNodePath('/opt/homebrew/Cellar/node/26.12.0/bin/node'), '/opt/homebrew/opt/node/bin/node');
});

test('Intel Homebrew and versioned Node formulae keep their own stable executable', () => {
  assert.equal(serviceNodePath('/usr/local/Cellar/node/26.12.0/bin/node'), '/usr/local/opt/node/bin/node');
  assert.equal(serviceNodePath('/opt/homebrew/Cellar/node@24/24.12.0/bin/node'), '/opt/homebrew/opt/node@24/bin/node');
});

test('service configuration preserves non-Homebrew Node installations and existing stable paths', () => {
  for (const executable of ['/usr/local/bin/node', '/opt/homebrew/opt/node/bin/node', '/custom/node/bin/node']) {
    assert.equal(serviceNodePath(executable), executable);
  }
});
