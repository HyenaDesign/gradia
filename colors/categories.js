import { colorEntries } from './colorUtils.js';
const category = (name,hexes) => ({name,colors:colorEntries(hexes)});
export const categories = {
    nature:category('Nature',['#164B35','#7E9A46','#76553A']),
    water:category('Water',['#073B70','#16A8B6','#B1E7D4']),
    fire:category('Fire',['#CC2529','#FF7A22','#FFD857']),
    space:category('Space',['#15183D','#6242A6','#D675CC']),
    weather:category('Weather',['#3D526A','#9FB5C4','#E4EBEE']),
    seasons:category('Seasons',['#DC9163','#B1BB79','#8A6A99']),
    technology:category('Technology',['#152638','#3AD9E8','#986BEE']),
    emotions:category('Emotions',['#E59BAA','#A2BFE0','#FFE1AA']),
    minerals:category('Minerals',['#565F70','#BBC7CC','#E0D4BD']),
    food:category('Food',['#F0B66D','#CC6259','#78965C']),
    animals:category('Animals',['#C88C49','#47382E','#E9D5AE']),
    environments:category('Environments',['#C99867','#739383','#728FA4']),
};
