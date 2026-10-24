import { colorEntries } from './colorUtils.js';
const brand = (id,name,aliases,hexes,weights,extra={}) => ({
    id,name,type:'brand',aliases,colors:colorEntries(hexes,weights),verified:false,
    status:'inspired',source:null,
    verificationNote:'Curated identity-inspired approximation; exact current brand specifications are not verified.',
    proportionsSource:'Chromelt composition choice, not an official brand ratio',...extra,
});
export const brands = [
    brand('xbox','Xbox',['x box','xbox gaming'],['#107C10','#FFFFFF','#000000'],[.65,.2,.15],{
        status:'historical',source:'https://retrocdn.net/images/c/c0/Xbox_BrandGuidelines_2019-04-15.pdf',
        verificationNote:'Values documented in Xbox’s April 2019 guidelines (archived copy, page 15); current specifications not independently confirmed.',
    }),
    brand('playstation','PlayStation',['play station','ps5','ps4'],['#003791','#FFFFFF','#161616'],[.65,.2,.15]),
    brand('nintendo','Nintendo',[],['#E60012','#FFFFFF'],[.75,.25]),
    brand('spotify','Spotify',[],['#1ED760','#191414'],[.7,.3],{
        source:'https://developer.spotify.com/documentation/design',
        verificationNote:'Green/black identity referenced in Spotify’s design guide; this curated pair’s exact HEX specifications are approximate.',
    }),
    brand('netflix','Netflix',[],['#E50914','#101010'],[.7,.3],{source:'https://brand.netflix.com/en/assets/logos/'}),
    brand('youtube','YouTube',['you tube','yt'],['#FF0033','#212121','#FFFFFF'],[.65,.2,.15],{
        verified:true,status:'documented',source:'https://partnermarketinghub.withgoogle.com/brands/youtube-kids/visual-identity/color-palette/',
        verificationNote:'YouTube Red, Almost Black, and White documented in Google’s YouTube Kids logo palette. Proportions are artistic choices.',
    }),
    brand('instagram','Instagram',['insta'],['#833AB4','#E1306C','#FCAF45'],[.35,.4,.25]),
    brand('red-bull','Red Bull',['redbull'],['#DB0A40','#0B1D51','#C5CDD5'],[.4,.4,.2],{
        source:'https://www.redbull.com/us-en/energydrink',material:{type:'metallic',roughness:.2,highlightIntensity:.8},
        verificationNote:'Inspired by original can imagery; silver is a flat-color approximation of metal. HEX values are not official specifications.',
    }),
    brand('nalu','Nalu',['nalu energy'],['#B8E529','#101C35','#008BFF'],[.55,.25,.2],{
        verificationNote:'Lime, navy, and electric-blue direction supplied in the project brief; inspired, not an official Nalu specification.',
    }),
    brand('coca-cola','Coca-Cola',['coca cola','cocacola','coke'],['#F40009','#FFFFFF'],[.75,.25]),
    brand('pepsi','Pepsi',[],['#005CB4','#EE1C25','#FFFFFF'],[.5,.3,.2]),
    brand('mcdonalds',"McDonald's",['mcdonalds','mcdonald'],['#FFC72C','#DA291C'],[.6,.4]),
    brand('apple','Apple',[],['#E8E8ED','#6E6E73','#171719'],[.5,.2,.3]),
    brand('microsoft','Microsoft',['msft'],['#F25022','#7FBA00','#00A4EF','#FFB900'],[.25,.25,.25,.25]),
    brand('discord','Discord',[],['#5865F2','#E0E3FF','#000000'],[.65,.2,.15],{
        verified:true,status:'documented',source:'https://discord.com/branding',
        verificationNote:'Blurple, Light Blurple, and Black HEX values documented on Discord’s brand page; proportions are artistic choices.',
    }),
    brand('twitch','Twitch',[],['#9146FF','#000000','#F0F0FF'],[.65,.2,.15],{source:'https://brand.twitch.com/'}),
    brand('figma','Figma',[],['#F24E1E','#FF7262','#A259FF','#1ABCFE','#0ACF83'],[.2,.15,.25,.2,.2]),
    brand('adobe','Adobe',[],['#FF0000','#FFFFFF','#202020'],[.65,.2,.15]),
    brand('nike','Nike',[],['#111111','#FFFFFF'],[.65,.35]),
    brand('adidas','Adidas',[],['#111111','#FFFFFF'],[.6,.4]),
    brand('lego','LEGO',[],['#E3000B','#FFCF00','#FFFFFF'],[.55,.3,.15]),
];
