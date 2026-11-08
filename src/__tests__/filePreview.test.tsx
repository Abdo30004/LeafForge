import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  getFileCategory,
  isBuildArtifact,
  getFileExtension,
} from '../utils/fileCategory';
import { UnsupportedFilePreview } from '../components/preview/UnsupportedFilePreview';
import { ImagePreview } from '../components/preview/ImagePreview';

describe('File Category & Build Artifact Filtering', () => {
  it('correctly categorizes text and LaTeX documents', () => {
    expect(getFileCategory('main.tex')).toBe('text');
    expect(getFileCategory('sections/intro.tex')).toBe('text');
    expect(getFileCategory('references.bib')).toBe('text');
    expect(getFileCategory('preamble.sty')).toBe('text');
    expect(getFileCategory('thesis.cls')).toBe('text');
    expect(getFileCategory('data.csv')).toBe('text');
    expect(getFileCategory('config.json')).toBe('text');
    expect(getFileCategory('script.py')).toBe('text');
    expect(getFileCategory('.gitignore')).toBe('text');
  });

  it('correctly categorizes graphic and image assets', () => {
    expect(getFileCategory('figures/architecture.png')).toBe('image');
    expect(getFileCategory('photo.jpg')).toBe('image');
    expect(getFileCategory('diagram.jpeg')).toBe('image');
    expect(getFileCategory('animation.gif')).toBe('image');
    expect(getFileCategory('vector.svg')).toBe('image');
    expect(getFileCategory('hero.webp')).toBe('image');
    expect(getFileCategory('icon.ico')).toBe('image');
  });

  it('correctly categorizes PDF files', () => {
    expect(getFileCategory('document.pdf')).toBe('pdf');
    expect(getFileCategory('figures/imported_chart.pdf')).toBe('pdf');
  });

  it('correctly categorizes binary and unsupported file formats', () => {
    expect(getFileCategory('archive.zip')).toBe('unsupported');
    expect(getFileCategory('bundle.tar.gz')).toBe('unsupported');
    expect(getFileCategory('binary.exe')).toBe('unsupported');
    expect(getFileCategory('font.ttf')).toBe('unsupported');
    expect(getFileCategory('library.dll')).toBe('unsupported');
    expect(getFileCategory('unknown_data.bin')).toBe('unsupported');
  });

  it('accurately identifies compiler build artifacts and internal directories', () => {
    expect(isBuildArtifact('main.aux')).toBe(true);
    expect(isBuildArtifact('main.log')).toBe(true);
    expect(isBuildArtifact('main.synctex.gz')).toBe(true);
    expect(isBuildArtifact('main.synctex')).toBe(true);
    expect(isBuildArtifact('main.fls')).toBe(true);
    expect(isBuildArtifact('main.fdb_latexmk')).toBe(true);
    expect(isBuildArtifact('main.toc')).toBe(true);
    expect(isBuildArtifact('main.bbl')).toBe(true);
    expect(isBuildArtifact('main.blg')).toBe(true);
    expect(isBuildArtifact('main.run.xml')).toBe(true);
    expect(isBuildArtifact('.texflow')).toBe(true);
    expect(isBuildArtifact('.leafforge-cache')).toBe(true);
    expect(isBuildArtifact('.git')).toBe(true);

    // Source files must NOT be flagged as build artifacts
    expect(isBuildArtifact('main.tex')).toBe(false);
    expect(isBuildArtifact('intro.tex')).toBe(false);
    expect(isBuildArtifact('references.bib')).toBe(false);
    expect(isBuildArtifact('figures/diagram.png')).toBe(false);
  });

  it('extracts correct file extension', () => {
    expect(getFileExtension('paper.tex')).toBe('tex');
    expect(getFileExtension('deep/path/photo.PNG')).toBe('png');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(getFileExtension('noextension')).toBe('');
  });
});

describe('Preview Components Rendering', () => {
  it('renders UnsupportedFilePreview with helpful message and action button', () => {
    const html = renderToString(
      <UnsupportedFilePreview filePath="C:/workspace/archive.zip" />
    );
    expect(html).toContain('archive.zip');
    expect(html).toContain('File format not supported for text editing');
    expect(html).toContain('Open in System Default App');
    expect(html).toContain('Show in Folder');
  });

  it('renders ImagePreview toolbar with Copy LaTeX button', () => {
    const html = renderToString(
      <ImagePreview filePath="C:/workspace/figures/diagram.png" />
    );
    expect(html).toContain('diagram.png');
    expect(html).toContain('Copy LaTeX');
    expect(html).toContain('Open in System Default Viewer');
  });
});
