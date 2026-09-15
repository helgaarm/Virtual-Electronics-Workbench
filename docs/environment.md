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
Humidity, wind, illuminance, and wavelength are stored simulation inputs ready for compatible sensor
models; they do not fabricate electrical outputs when no such sensor is present.

Environment settings are bounded and validated when a project is loaded. Projects from schema
versions before 12 migrate to 25 °C, 50% RH, still air, 500 lux daylight at 550 nm.

