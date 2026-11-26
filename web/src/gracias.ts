import './styles/base.css';
import { cart } from './lib/cart';
import { $ } from './lib/dom';
import { brand, footer, yarnMark } from './lib/layout';

$('#brand').outerHTML = brand();
$('#mark').innerHTML = yarnMark;
$('#footer').outerHTML = footer();
// El pago ya está hecho: vaciamos la cesta
cart.clear();
