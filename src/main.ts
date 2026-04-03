import './style.css'
import { mountApp } from './ui/app'

const app = document.querySelector<HTMLDivElement>('#app')
if (app) void mountApp(app)
