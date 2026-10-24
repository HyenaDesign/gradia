import { resolvePalette, DEFAULT_CUSTOM } from './colorResolver.js';
import { normalizeHex, normalizeColors } from './colorUtils.js';
const STORAGE_KEY='chromelt-colors-v1';
export function createPaletteControls(onChange) {
    const root=document.getElementById('palettePanel');
    let mode='semantic', customColors=[...DEFAULT_CUSTOM];
    try {
        const saved=JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if(['semantic','character','custom'].includes(saved?.mode)) mode=saved.mode;
        if(Array.isArray(saved?.colors)) {
            const valid=saved.colors.map(normalizeHex).filter(Boolean).slice(0,6);
            if(valid.length) customColors=valid;
        }
    } catch { /* Storage is optional, including in private browsing. */ }
    root.innerHTML=`
        <div class="color-modes" role="group" aria-label="Color mode">
          <button type="button" data-mode="semantic">Semantic</button>
          <button type="button" data-mode="character">Character</button>
          <button type="button" data-mode="custom">Custom</button>
        </div>
        <div class="palette-heading"><strong id="paletteName"></strong><a id="paletteSource" target="_blank" rel="noopener noreferrer" hidden>Reference ↗</a></div>
        <p id="paletteDescription" class="palette-description"></p>
        <ul id="paletteSwatches" class="palette-swatches" aria-label="Selected palette"></ul>
        <div id="customEditor" hidden><div id="customRows" class="custom-rows"></div>
          <button type="button" id="addColor" class="add-color">+ Add color</button>
          <p id="colorError" class="color-error" role="status"></p>
        </div>`;
    const name=root.querySelector('#paletteName'), description=root.querySelector('#paletteDescription');
    const swatches=root.querySelector('#paletteSwatches'), source=root.querySelector('#paletteSource');
    const editor=root.querySelector('#customEditor'), rows=root.querySelector('#customRows');
    let currentText='', resolution, signature='';
    function persist() {
        try { localStorage.setItem(STORAGE_KEY,JSON.stringify({mode,colors:customColors})); } catch { /* Nonessential preference. */ }
    }
    function renderPreview() {
        const empty=!currentText.trim() && mode!=='custom';
        name.textContent=empty?'Color identity':resolution.name;
        const count=resolution.colors.length;
        const type=resolution.type==='brand'?'Brand palette':resolution.type==='semantic'?'Semantic palette':resolution.type==='custom'?'Custom palette':'Character-generated';
        const status=resolution.type==='brand' ? ` · ${resolution.verified?'Documented':resolution.status==='historical'?'Archived reference':'Inspired'}` : '';
        description.textContent=empty?'Type a brand, feeling or place.':`${type} · ${count} color${count===1?'':'s'}${status}`;
        description.title=resolution.verificationNote || '';
        source.hidden=empty || !resolution.source;
        if(resolution.source) { source.href=resolution.source;source.title=resolution.verificationNote || 'Palette reference'; }
        else source.removeAttribute('href');
        swatches.replaceChildren();
        if(!empty) for(const color of resolution.colors) {
            const item=document.createElement('li'), dot=document.createElement('span'), label=document.createElement('code');
            dot.className='swatch';dot.style.backgroundColor=color.hex;dot.setAttribute('aria-hidden','true');
            label.textContent=color.hex;
            item.title=`${color.hex} · ${Math.round(color.weight*100)}% target dye share`;
            item.append(dot,label);swatches.append(item);
        }
        for(const button of root.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
        editor.hidden=mode!=='custom';
    }
    function update(text=currentText) {
        currentText=text;
        const next=JSON.stringify([text,mode,customColors]);
        if(next!==signature) {
            signature=next;resolution=resolvePalette(text,{mode,customColors});renderPreview();
        }
        return resolution;
    }
    function change() { signature='';persist();update();onChange(); }
    function renderEditor() {
        rows.replaceChildren();
        customColors.forEach((hex,index)=>{
            const row=document.createElement('div');row.className='custom-color';
            const picker=document.createElement('input');picker.type='color';picker.value=hex;picker.setAttribute('aria-label',`Choose color ${index+1}`);
            const field=document.createElement('input');field.type='text';field.value=hex;field.maxLength=7;field.spellcheck=false;field.setAttribute('aria-label',`Color ${index+1} HEX`);
            const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove color ${index+1}`);remove.disabled=customColors.length===1;
            function apply(value) {
                const parsed=normalizeHex(value);
                field.setAttribute('aria-invalid',String(!parsed));
                root.querySelector('#colorError').textContent=parsed?'':'Use a HEX color, such as #69A7FF.';
                if(!parsed)return;
                customColors[index]=parsed;picker.value=parsed;change();
            }
            picker.addEventListener('input',()=>{field.value=picker.value.toUpperCase();apply(field.value);});
            field.addEventListener('input',()=>apply(field.value));
            field.addEventListener('blur',()=>{field.value=customColors[index];field.removeAttribute('aria-invalid');root.querySelector('#colorError').textContent='';});
            remove.addEventListener('click',()=>{customColors.splice(index,1);renderEditor();change();});
            row.append(picker,field,remove);rows.append(row);
        });
        root.querySelector('#addColor').disabled=customColors.length>=6;
    }
    for(const button of root.querySelectorAll('[data-mode]')) button.addEventListener('click',()=>{
        if(mode===button.dataset.mode)return;
        mode=button.dataset.mode;if(mode==='custom')renderEditor();change();
    });
    root.querySelector('#addColor').addEventListener('click',()=>{
        if(customColors.length>=6)return;
        customColors.push(DEFAULT_CUSTOM[customColors.length%DEFAULT_CUSTOM.length]);renderEditor();change();
    });
    if(mode==='custom')renderEditor();
    update();
    return {update,get mode(){return mode;},get palette(){return resolution;},get colors(){return normalizeColors(customColors);}};
}
