# Third-party licenses

## Equinor Engineering Symbols

- Repository: https://github.com/equinor/engineering-symbols
- Reference revision: `e86fad89d8e747366daeb2c5006c35a7cf8cd00e` (branch `develop`)
- Package version at the referenced revision: `@equinor/engineering-symbols` 1.1.3
- License: MIT
- Copyright: Copyright (c) 2020 Equinor ASA
- Incorporated files: `PT002A_Option1.svg` and `PV003B.svg`, copied to `src/library/assets/` and exposed to the plugin from `src/img/` as `library-PT002A_Option1.svg` and `library-PV003B.svg`.

The referenced revision contains only these two files in its top-level `svg/`
directory. The five motors below are separate Openclipart public-domain works.

The MIT license notice for the incorporated symbols is reproduced below:

```
MIT License

Copyright (c) 2020 Equinor ASA

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Openclipart motor symbols

Openclipart identifies the following works as public-domain/CC0 works. The
original detail pages were consulted on 2026-08-14. Only the SVG downloads were
used; each local file was sanitized and received a monochrome gray visual
normalization without adding JavaScript or raster content. The first source
contains two separate motor drawings, so it produces two independent local SVGs.

| Name | Original name | Author | Original URL | Local file | License |
| --- | --- | --- | --- | --- | --- |
| Motor elétrico industrial horizontal | Electrical Motor (upper motor) | AlignEasy | https://openclipart.org/detail/271781/electrical-motor | `src/library/assets/modules/motores/openclipart/industrial-electric-motor-upper.svg` | Public Domain / CC0 |
| Motor elétrico industrial compacto | Electrical Motor (lower motor) | AlignEasy | https://openclipart.org/detail/271781/electrical-motor | `src/library/assets/modules/motores/openclipart/industrial-electric-motor-lower.svg` | Public Domain / CC0 |
| Motor elétrico de ventilação | Electric Motor | algotruneman | https://openclipart.org/detail/333614/electric-motor | `src/library/assets/modules/motores/openclipart/ventilation-electric-motor.svg` | Public Domain / CC0 |
| Motor de passo | Stepper motor | cyberscooty | https://openclipart.org/detail/201458/stepper-motor | `src/library/assets/modules/motores/openclipart/stepper-motor.svg` | Public Domain / CC0 |
| Motor vibratório | Vibrating Motor | Inventoteca | https://openclipart.org/detail/267434/vibrating-motor | `src/library/assets/modules/motores/openclipart/vibrating-motor.svg` | Public Domain / CC0 |
| Motor elétrico trifásico | A simple representation of a electric 3-phase motor | Eypros | https://openclipart.org/detail/141613/a-simple-representation-of-a-electric-3phase-motor | `src/library/assets/modules/motores/openclipart/three-phase-motor.svg` | Public Domain / CC0 |

The five files are recorded in `src/library/assets/openclipartMotorCatalog.json`.
Their metadata marks them as sanitized and visually modified; the modifications
only normalize the palette to gray and namespace SVG IDs to avoid collisions between
instances. The import process is reproducible with
`scripts/import-openclipart-motor-assets.py`.
