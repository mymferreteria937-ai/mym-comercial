# MYM Comercial ERP V13.14

Entrega consolidada de MYM Comercial ERP. La aplicación, módulos, formularios y documentación operativa utilizan una sola versión: **V13.14**.

## Cambios V13.14

- Ticket de 80 mm centrado sobre un área imprimible segura de 72 mm.
- Espacios laterales iguales para evitar desplazamiento y corte del borde derecho.
- Letra general aumentada a 16 px y productos a 15 px.
- Encabezado aumentado sin ampliar el ancho del comprobante.
- Corrección de la edición de productos: el registro abierto queda excluido de
  la validación de duplicados, aunque el formulario se reconstruya en pantalla.

## Cambios V13.11

- Ticket térmico desde el borde superior y con corte ajustado al contenido.
- Motivo obligatorio para anular una factura.
- Motivo, fecha y usuario visibles en el historial y en el comprobante anulado.
- Integración del cajón por controlador de Windows o por puente local ESC/POS.
- Prueba manual de apertura desde Configuración.

## Cambios V13.10

- Reporte de ventas y ganancias por mes, quincena actual, primera quincena, segunda quincena o fechas personalizadas.
- Rentabilidad calculada con el costo histórico de cada línea vendida y descontando las ventas anuladas.
- Separación por Ferretería, Librería y total consolidado.
- Desglose de efectivo, tarjeta y transferencia dentro del reporte.
- Historial de caja con efectivo esperado, efectivo contado, tarjeta, transferencia y total controlado en columnas independientes.
- El cierre solo informa éxito cuando Supabase confirma que la sesión quedó cerrada.

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
- Eliminación segura de productos duplicados desde Inventario.
- Desactivación sin pérdida de historial cuando el producto ya tiene movimientos.
- Sincronización del nombre comercial en la lista y la ficha lateral al editar.

## Supabase

Ejecute una sola vez antes de publicar:

1. `supabase/schema_v13_8_unificacion.sql`
2. `supabase/schema_v13_9_eliminar_productos.sql`
3. `supabase/schema_v13_11_anulacion_auditable.sql`

La migración convierte los precios automáticos existentes a margen real sobre
la venta. Los productos marcados con precio manual no se modifican.

La segunda migración agrega el borrado seguro: solo un administrador puede
eliminar definitivamente un producto sin historial. Si ya tiene ventas,
importaciones o movimientos, se conserva y puede desactivarse.

Para revisar los resultados sin modificar datos, ejecute:

`supabase/validar_v13_9_eliminar_productos.sql`
