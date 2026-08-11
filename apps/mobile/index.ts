import { createElement } from 'react'
import { registerRootComponent } from 'expo'
import App from './src/App'
import { createProtectedAreaServices } from './src/services'

// Composition root: real Expo/native adapters are wired here and injected into
// the component tree; screens only ever see the application-use-case boundary.
const services = createProtectedAreaServices()
const Root = () => createElement(App, { services })

registerRootComponent(Root)