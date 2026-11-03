import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyField } from '../src/trace.js';

const pages = ['Tenant: Copperleaf Coffee Ltd', 'The annual rent is GBP 48,100, payable quarterly in advance.'];
const rent = { value: 'GBP 48,100', page: 2, quote: 'The annual rent is GBP 48,100, payable quarterly in advance.' };

test('a field whose quote is on its page and contains its value is traced', () => {
  assert.equal(verifyField(pages, rent).status, 'traced');
});

test('extra whitespace from PDF text extraction does not break a match', () => {
  assert.equal(verifyField(pages, { ...rent, quote: 'The annual rent is  GBP 48,100,\npayable quarterly in advance.' }).status, 'traced');
});

test('a real quote cited on the wrong page is rejected', () => {
  assert.deepEqual(verifyField(pages, { ...rent, page: 1 }), { status: 'rejected', reason: 'quote not found on page 1' });
});

test('an invented quote is rejected, even when the value looks plausible', () => {
  const r = verifyField(pages, { value: 'GBP 52,000', page: 2, quote: 'The annual rent is GBP 52,000.' });
  assert.equal(r.status, 'rejected');
  assert.equal(r.reason, 'quote not found on page 2');
});

test('a true quote paired with a value it does not contain is rejected', () => {
  assert.deepEqual(verifyField(pages, { ...rent, value: 'GBP 52,000' }), { status: 'rejected', reason: 'value is not in the quote' });
});

test('a page that does not exist is rejected', () => {
  assert.equal(verifyField(pages, { ...rent, page: 3 }).reason, 'page 3 does not exist');
});

test('a field with no value is missing, not rejected', () => {
  assert.equal(verifyField(pages, { value: null, page: null, quote: null }).status, 'missing');
});
