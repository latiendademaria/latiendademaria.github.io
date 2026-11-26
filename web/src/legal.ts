import './styles/base.css';
import { $ } from './lib/dom';
import { brand, footer } from './lib/layout';

$('#brand').outerHTML = brand();
$('#footer').outerHTML = footer();
