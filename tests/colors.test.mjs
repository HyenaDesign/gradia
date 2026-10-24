import test from 'node:test';
import assert from 'node:assert/strict';
import {brands} from '../colors/brands.js';
import {keywords} from '../colors/keywords.js';
import {categories} from '../colors/categories.js';
import {resolvePalette,paletteCount} from '../colors/colorResolver.js';
import {normalizeName,normalizeColors,characterColor,weightedColumnIndices} from '../colors/colorUtils.js';

test('curated records and every alias are valid and resolve predictably',()=>{
    assert(paletteCount>=50 && paletteCount<=100);
    for(const entry of [...brands,...keywords]) {
        assert(entry.colors.length>0);assert(entry.name);assert(entry.type);
        assert(Math.abs(entry.colors.reduce((sum,c)=>sum+c.weight,0)-1)<1e-9);
        for(const color of entry.colors){assert.match(color.hex,/^#[0-9A-F]{6}$/);assert(color.weight>0);}
        for(const alias of [entry.name,entry.id,...entry.aliases])assert.equal(resolvePalette(alias).id,entry.id,alias);
        if(entry.verified)assert.match(entry.source,/^https:\/\//);
        if(entry.type==='brand'){assert(entry.status);assert(entry.verificationNote);}
    }
    assert.equal(Object.keys(categories).length,12);
});
test('normalization handles spacing, casing, punctuation and diacritics without fuzzy matches',()=>{
    for(const alias of ['Red Bull','RedBull',' red-bull ','RED  BULL','Réd Büll'])assert.equal(resolvePalette(alias).id,'red-bull');
    assert.equal(resolvePalette('McDonald’s').id,'mcdonalds');
    for(const text of ['red bullish','spotifyx','applesauce','fireplace','xboz','oceanic','apple pie'])assert.equal(resolvePalette(text).type,'character');
    assert.equal(normalizeName('  CÓCA—COLA  '),'cocacola');
});
test('priority, explicit modes, category defaults, and semantic overrides',()=>{
    assert.equal(resolvePalette('Apple').type,'brand');
    assert.deepEqual(resolvePalette('Xbox').colors.map(c=>c.hex),['#107C10','#FFFFFF','#000000']);
    assert.equal(resolvePalette('Ocean').type,'semantic');
    assert.equal(resolvePalette('Water').id,'category-water');
    assert.notDeepEqual(resolvePalette('lake').colors,resolvePalette('Water').colors);
    assert.equal(resolvePalette('Xbox',{mode:'character'}).type,'character');
    assert.deepEqual(resolvePalette('Xbox',{mode:'custom',customColors:['#abc','#000000']}).colors.map(c=>c.hex),['#AABBCC','#000000']);
});
test('fallback never returns an empty palette and keeps the original character mapping',()=>{
    for(const value of ['', '   ', 'unrecognized', '💧', null])assert(resolvePalette(value).colors.length>0);
    assert.equal(characterColor('A'),characterColor('a'));
    assert.deepEqual(resolvePalette('xyz',{mode:'character'}).colors.map(c=>c.hex),[...new Set(Array.from('xyz',characterColor))]);
    for(let i=0;i<10;i++)assert.deepEqual(resolvePalette('Xbox'),resolvePalette('Xbox'));
});
test('custom colors reject malformed values, merge duplicate weights, and normalize',()=>{
    const palette=normalizeColors([{hex:'#ABC',weight:2},{hex:'#aabbcc',weight:1},{hex:'#000',weight:1},{hex:'bad',weight:5},{hex:'#FF0000',weight:-3}]);
    assert.deepEqual(palette.map(c=>[c.hex,c.weight]),[['#AABBCC',.75],['#000000',.25]]);
    for(const values of [[],null,['invalid'],[{hex:'#FFFFFF',weight:NaN}]])assert(normalizeColors(values).length>0);
});
test('weighted ink distribution compensates for glyph width and includes all colors',()=>{
    const colors=resolvePalette('Xbox').colors;
    const columns=Array.from({length:1000},(_,i)=>i%100<20?0:((i%7)+1)*12);
    const assignments=weightedColumnIndices(columns,colors);
    const total=columns.reduce((a,b)=>a+b,0), shares=colors.map(()=>0);
    assignments.forEach((index,x)=>shares[index]+=columns[x]/total);
    shares.forEach((share,i)=>assert(Math.abs(share-colors[i].weight)<.005));
    assert.deepEqual(assignments,weightedColumnIndices(columns,colors));
    const singleGlyph=weightedColumnIndices(Array(60).fill(20),colors);
    assert.deepEqual([...new Set(singleGlyph)],[0,1,2]);
});
