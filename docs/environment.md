# External environment

The Build workspace has one project-level environment shared by every environmental sensor. It can
represent temperature, relative humidity, wind speed, illuminance, light source type, and dominant
wavelength. Conditions are saved with the project and participate in undo, redo, and simulation
invalidation.

## Controls and units

| Condition | Supported range | Unit |
| --- | --- | --- |
| Temperature | −80 to 100 | °C |
| Relative humidity | 0 to 100 | % RH |
| Wind speed | 0 to 100 | m/s |
| Illuminance | 0 to 200,000 | lux |
| Dominant wavelength | 100 to 2,000 | nm |

Light presets—daylight, incandescent, fluorescent, LED, ultraviolet, and infrared—choose a useful
representative wavelength. Editing wavelength directly changes the source type to **Custom**. A
single wavelength does not fully describe a real source spectrum; it is an explicit educational
input for wavelength-sensitive component models.

The TMP36 reads shared temperature and produces its electrical output through circuit extraction.
NTC thermistors respond to shared temperature and wind through an illustrative electrothermal model.
Connected heater power warms an associated NTC; airflow increases cooling. See the
[wind-sensor guide](wind-sensor.md) for assumptions and measured calibration. Humidity, illuminance
and wavelength remain stored inputs for future compatible models; they do not fabricate outputs.

Environment settings are bounded and validated when a project is loaded. Projects from schema
versions before 12 migrate to 25 °C, 50% RH, still air, 500 lux daylight at 550 nm.

