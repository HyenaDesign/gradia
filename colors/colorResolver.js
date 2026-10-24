import { brands } from './brands.js';
import { keywords } from './keywords.js';
import { categories } from './categories.js';
import { normalizeName, normalizeColors, characterColor } from './colorUtils.js';
export const DEFAULT_CUSTOM = ['#69A7FF','#BA9CFF','#FFD6B0'];
function buildIndex(entries) {
    const index=new Map();
    for(const entry of entries) for(const name of [entry.id,entry.name,...entry.aliases]) {
        const key=normalizeName(name);
        if(index.has(key) && index.get(key)!==entry) throw new Error(`Duplicate palette alias: ${name}`);
        index.set(key,entry);
    }
    return index;
}
const brandIndex=buildIndex(brands);
const keywordIndex=buildIndex(keywords);
const categoryIndex=buildIndex(Object.entries(categories).map(([id,c])=>({
    ...c,id:`category-${id}`,type:'semantic',category:id,aliases:[id],status:'curated',verified:false,source:null,
})));
export const paletteCount=brands.length+keywords.length;
export function resolvePalette(text, {mode='semantic',customColors=DEFAULT_CUSTOM}={}) {
    if(mode==='custom') return {id:'custom',name:'Your palette',type:'custom',status:'custom',colors:normalizeColors(customColors)};
    if(mode==='semantic') {
        const key=normalizeName(text);
        const match=brandIndex.get(key) || keywordIndex.get(key) || categoryIndex.get(key);
        if(match) return match;
    }
    const characters=Array.from(String(text ?? '')).filter(c=>! /\s/u.test(c));
    return {
        id:'character',name:mode==='character'?'Character colors':'Character fallback',type:'character',
        status:'generated',fallback:mode!=='character',
        colors:normalizeColors((characters.length ? characters : ['a']).map(c=>characterColor(c))),
    };
}
