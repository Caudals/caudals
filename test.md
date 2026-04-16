
## Láser / transmisor electroóptico usados como referencia

* Familia tomada como referencia: **JDSU CQF15 Series, 10 Gb/s EA-modulated DFB laser**. 
* Tipo de dispositivo: **láser DFB de 1550 nm con modulador electroabsortivo integrado**. 
* Compatibilidad: **10 Gb/s, OC-192 / STM-64**. 
* Variante usada como referencia para la relación de extinción: **CQF15/48**. 
* Relación de extinción dinámica usada: **(ER = 9\ \text{dB})** para **CQF15/48** con **(V_{mod}=2.5\ \text{V}_{pp})**. 
* Ancho de banda (-3\ \text{dB}): **10–12 GHz**. 
* Longitud de onda central del dispositivo: **1530–1564 nm**. 
* SMSR: **30–45 dB**. 
* Penalización de dispersión de la variante CQF15/48: **1–1.5 dB** para **800 ps/nm**. 

## Fibra SMF usada

* Fibra de referencia: **Corning SMF-28e**, G.652.D. 
* Atenuación a 1550 nm: **0.19–0.20 dB/km**. En la resolución se tomó **(0.20\ \text{dB/km})**.
* Dispersión a 1550 nm: **(\le 18\ \text{ps}/(\text{nm}\cdot\text{km}))**.
* Longitud de onda de dispersión nula:

  * rango especificado: **1302–1322 nm**;
  * valor típico usado en la resolución: **(\lambda_0 = 1313\ \text{nm})**. 
* Pendiente de dispersión nula:

  * cota especificada: **(S_0 \le 0.089\ \text{ps}/(\text{nm}^2\cdot\text{km}))**;
  * valor típico usado en la resolución: **(S_0 = 0.086\ \text{ps}/(\text{nm}^2\cdot\text{km}))**. 
* PMD link design value: **(\le 0.06\ \text{ps}/\sqrt{\text{km}})**.
* PMD máxima de fibra individual: **(\le 0.2\ \text{ps}/\sqrt{\text{km}})**.

## DCM / compensación de dispersión usados

* Opciones consideradas en el examen: **DCM-80** y **DCM-100**.
* Valores de compensación usados en la resolución:

  * **DCM-80: (-1314\ \text{ps/nm})**,
  * **DCM-100: (-1642\ \text{ps/nm})**.
* Pérdida de inserción adoptada para el DCM en la resolución: **(6.5\ \text{dB})**.

## EDFA usado como referencia

* Familia de referencia: **BaySpec IntelliGain C-Band Series EDFA**.
* Variante tomada como referencia: **In-Line Amplifier**.
* Rango de longitudes de onda: **1530–1562 nm**.
* Ganancia de pequeña señal del in-line amplifier: **(\ge 25\ \text{dB})** para **(P_{in}=-20\ \text{dBm})**. En la resolución se tomó **(25\ \text{dB})**.
* Potencia de salida saturada del in-line amplifier: **(\ge 15\ \text{dBm})** para **(P_{in}=-3\ \text{dBm})**.
* Figura de ruido: **(\le 5.5\ \text{dB})**. En la resolución se adoptó **(NF = 5\ \text{dB})** como valor de trabajo.
* Sensibilidad a polarización: **< 0.3 dB**.
* Return loss de entrada y salida: **> 35 dB** con bomba apagada.
* Gain flatness: **(\le 1.0\ \text{dB})** pico a pico, con **GFF @ 25 ºC**.
* Alimentación: **+5.0 V DC**.
* Corriente de operación (in-line): **< 1.8 A**.
* Consumo (in-line): **< 9.0 W**.
* Temperatura de operación: **(-5) a (65\ ^\circ\text{C})**.
* Dato operativo adicional usado para ajustar el modelo de saturación en la resolución: **(G(0\ \text{dBm}) = 14\ \text{dB})**.

## Receptor óptico PIN usado como referencia en la cadena

* Módulo de referencia: **JDSU ERM 588, 10 Gb/s AGC PIN Receiver Module**.
* Fotodetector: **PIN InGaAs**.
* Responsividad del PD: **0.8 A/W**.
* Transimpedancia AC sin bloque de ganancia variable: **600 (\Omega)**.
* Ganancia variable: **de (-12) a (+15\ \text{dB})**.
* Transimpedancia AC total: **150–3500 (\Omega)**.
* Ancho de banda (-3\ \text{dB}): **8.5 GHz**.
* Corte de baja frecuencia (-3\ \text{dB}): **40 kHz**.
* Sensibilidad: **(-17\ \text{dBm})** a **10 Gb/s**, **BER = (10^{-12})**, **PRBS = (2^{31}-1)**, **25 ºC**, **(\lambda = 1550\ \text{nm})**.
* Sobrecarga: **0 dBm** a **10 Gb/s**, **BER = (10^{-12})**, **PRBS = (2^{31}-1)**.
* Rango de potencia óptica para operación AGC: **(-17) a (-3\ \text{dBm})**.
* Optical return loss: **(-27\ \text{dB})** para **1300–1575 nm**.
* Alimentación: **(-5.5) a (-4.9\ \text{V})**, nominal **(-5.2\ \text{V})**. 
* Tensión del PD: **4.75–12.0 V**, nominal **5.0 V**. 
* Longitud de onda de operación: **1300–1575 nm**. 
* Temperatura de operación: **0–70 ºC**. 