# Example asset licensing

The three character sets under `public/characters/` are project demo assets:

- `niu-lai` is reference-guided artwork generated with OpenAI ImageGen from a film still of the character Niu Lai, then converted into layered pixel-art sprites with the bundled asset-generation Skill. The reference image is not distributed with this repository. Niu Lai and the underlying film character remain the property of their respective rights holders; this asset is excluded from the repository's MIT License and must not be redistributed without the necessary rights.
- `pixel-bot` is original project artwork created for the Hoho Avatar demo.
- `pixel-portrait` is a stylized portrait asset contributed by the project maintainer. Reference photographs and source images are intentionally not distributed with this repository.

The project maintainer has chosen to distribute `pixel-bot` and `pixel-portrait` under the repository's [MIT License](LICENSE). This permits reuse and modification of those asset files under its terms. Their inclusion does not imply endorsement of a derivative work, product, or service by the project contributors or any depicted person.

Contributors adding an example character must own the artwork or have explicit redistribution rights. Document its source and license in this file. Do not commit private reference images, temporary generations, or assets whose redistribution terms are unclear.

## KittenTTS phonemizer data

`public/espeak-en-dict.tsv` and `public/en_rules` are copied from the
[`kitten-tts-webgpu` public assets](https://github.com/svenflow/kitten-tts-webgpu/tree/main/public).
They are required because version 0.1.1 of the published npm package references
these files at runtime but does not include them in the package archive. The
upstream project attributes the dictionary and rule data to espeak-ng and marks
those data files as GPL-3.0. They are not covered by this repository's MIT
License.
