// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2017, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
import { expect } from 'chai';

import {
  JSONArray,
  JSONExt,
  JSONObject,
  JSONPrimitive,
  PartialJSONObject
} from '@lumino/coreutils';

interface IFoo extends PartialJSONObject {
  bar?: string;
}

describe('@lumino/coreutils', () => {
  describe('JSONExt', () => {
    describe('isPrimitive()', () => {
      it('should return `true` if the value is a primitive', () => {
        expect(JSONExt.isPrimitive(null)).to.equal(true);
        expect(JSONExt.isPrimitive(false)).to.equal(true);
        expect(JSONExt.isPrimitive(true)).to.equal(true);
        expect(JSONExt.isPrimitive(1)).to.equal(true);
        expect(JSONExt.isPrimitive('1')).to.equal(true);
      });

      it('should return `false` if the value is not a primitive', () => {
        expect(JSONExt.isPrimitive([])).to.equal(false);
        expect(JSONExt.isPrimitive({})).to.equal(false);
      });
    });

    describe('isArray()', () => {
      it('should test whether a JSON value is an array', () => {
        expect(JSONExt.isArray([])).to.equal(true);
        expect(JSONExt.isArray(null)).to.equal(false);
        expect(JSONExt.isArray(1)).to.equal(false);
      });
    });

    describe('isObject()', () => {
      it('should test whether a JSON value is an object', () => {
        expect(JSONExt.isObject({ a: 1 })).to.equal(true);
        expect(JSONExt.isObject({})).to.equal(true);
        expect(JSONExt.isObject([])).to.equal(false);
        expect(JSONExt.isObject(1)).to.equal(false);
      });
    });

    describe('deepEqual()', () => {
      it('should compare two JSON values for deep equality', () => {
        expect(JSONExt.deepEqual([], [])).to.equal(true);
        expect(JSONExt.deepEqual([1], [1])).to.equal(true);
        expect(JSONExt.deepEqual({}, {})).to.equal(true);
        expect(JSONExt.deepEqual({ a: [] }, { a: [] })).to.equal(true);
        expect(
          JSONExt.deepEqual({ a: { b: null } }, { a: { b: null } })
        ).to.equal(true);
        expect(JSONExt.deepEqual({ a: '1' }, { a: '1' })).to.equal(true);
        expect(
          JSONExt.deepEqual({ a: { b: null } }, { a: { b: '1' } })
        ).to.equal(false);
        expect(JSONExt.deepEqual({ a: [] }, { a: [1] })).to.equal(false);
        expect(JSONExt.deepEqual([1], [1, 2])).to.equal(false);
        expect(JSONExt.deepEqual(null, [1, 2])).to.equal(false);
        expect(JSONExt.deepEqual([1], {})).to.equal(false);
        expect(JSONExt.deepEqual([1], [2])).to.equal(false);
        expect(JSONExt.deepEqual({}, { a: 1 })).to.equal(false);
        expect(JSONExt.deepEqual({ b: 1 }, { a: 1 })).to.equal(false);
      });

      it('should handle optional keys on partials', () => {
        let a: IFoo = {};
        let b: IFoo = { bar: 'a' };
        let c: IFoo = { bar: undefined };
        expect(JSONExt.deepEqual(a, b)).to.equal(false);
        expect(JSONExt.deepEqual(a, c)).to.equal(true);
        expect(JSONExt.deepEqual(c, a)).to.equal(true);
      });

      it('should equate an object to its deepCopy', () => {
        let a: IFoo = {};
        let b: IFoo = { bar: 'a' };
        let c: IFoo = { bar: undefined };
        expect(JSONExt.deepEqual(a, JSONExt.deepCopy(a))).to.equal(true);
        expect(JSONExt.deepEqual(b, JSONExt.deepCopy(b))).to.equal(true);
        expect(JSONExt.deepEqual(c, JSONExt.deepCopy(c))).to.equal(true);
      });
    });

    describe('deepCopy()', () => {
      it('should deep copy an object', () => {
        let v1: JSONPrimitive = null;
        let v2: JSONPrimitive = true;
        let v3: JSONPrimitive = false;
        let v4: JSONPrimitive = 'foo';
        let v5: JSONPrimitive = 42;
        let v6: JSONArray = [1, 2, 3, [4, 5, 6], { a: 12, b: [4, 5] }, false];
        let v7: JSONObject = { a: false, b: [null, [1, 2]], c: { a: 1 } };
        let r1 = JSONExt.deepCopy(v1);
        let r2 = JSONExt.deepCopy(v2);
        let r3 = JSONExt.deepCopy(v3);
        let r4 = JSONExt.deepCopy(v4);
        let r5 = JSONExt.deepCopy(v5);
        let r6 = JSONExt.deepCopy(v6);
        let r7 = JSONExt.deepCopy(v7);
        expect(v1).to.equal(r1);
        expect(v2).to.equal(r2);
        expect(v3).to.equal(r3);
        expect(v4).to.equal(r4);
        expect(v5).to.equal(r5);
        expect(v6).to.deep.equal(r6);
        expect(v7).to.deep.equal(r7);
        expect(v6).to.not.equal(r6);
        expect(v6[3]).to.not.equal(r6[3]);
        expect(v6[4]).to.not.equal(r6[4]);
        expect((v6[4] as JSONObject)['b']).to.not.equal(
          (r6[4] as JSONObject)['b']
        );
        expect(v7).to.not.equal(r7);
        expect(v7['b']).to.not.equal(r7['b']);
        expect((v7['b'] as JSONArray)[1]).to.not.equal(
          (r7['b'] as JSONArray)[1]
        );
        expect(v7['c']).to.not.equal(r7['c']);
      });

      it('should handle optional keys on partials', () => {
        let v1: IFoo = {};
        let v2: IFoo = { bar: 'a' };
        let v3 = { a: false, b: { bar: undefined } };
        let r1 = JSONExt.deepCopy(v1);
        let r2 = JSONExt.deepCopy(v2);
        let r3 = JSONExt.deepCopy(v3);
        expect(Object.keys(r1).length).to.equal(0);
        expect(v2.bar).to.equal(r2.bar);
        expect(Object.keys(r3.b).length).to.equal(0);
      });
    });
  });
});
