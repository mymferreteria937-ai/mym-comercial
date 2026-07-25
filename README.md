# MYM Comercial ERP V13.8

Entrega consolidada de MYM Comercial ERP. La aplicación, módulos, formularios y documentación operativa utilizan una sola versión: **V13.8**.

## Publicación en Vercel

Suba el contenido completo del paquete conservando la estructura de carpetas. Vercel debe utilizar la raíz del proyecto, donde se encuentran:

- `index.html`: sitio web público.
- `site.css` y `site.js`: diseño y funciones del sitio público.
- `vercel.json`: rutas de publicación.
- `app/`: sistema administrativo accesible desde `/app/`.

No configure `app` como Root Directory, porque eso excluiría el sitio web público.

## Incluye

- Dashboard multiunidad.
- POS, inventario, clientes, cajas y etiquetas.
- Impresión y reimpresión térmica.
- Ventas y ganancia diaria.
- Historial filtrable por fecha.
- Reportes y gráficos de comportamiento.
- Precios calculados con margen real de 35%, 40%, 50% o porcentaje personalizado.
- Precio de venta manual con cálculo del margen resultante.
- Política de descuento manual persistente.
- Anulación auditable de ventas.
- Conexión automática después del ingreso.

## Supabase

Ejecute una sola vez antes de publicar:

`supabase/schema_v13_8_unificacion.sql`

La migración convierte los precios automáticos existentes a margen real sobre
la venta. Los productos marcados con precio manual no se modifican.
