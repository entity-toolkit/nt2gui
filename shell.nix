{
  pkgs ? import <nixpkgs> { },
  py ? "313",
}:

let
  name = "nt2gui";
in
pkgs.mkShell {

  name = "${name}-env";
  nativeBuildInputs = with pkgs; [
    zlib
    pkgs."python${py}"
    pkgs."python${py}Packages".pip

    taplo
    vscode-langservers-extracted
    black
    pyright

    nodePackages.nodejs
    emmet-ls
    typescript-language-server
    taplo
    yaml-language-server
    eslint
    mdformat
    prettierd
  ];

  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath ([
    pkgs.stdenv.cc.cc
    pkgs.zlib
  ]);

  shellHook = ''
    echo -e "${name} nix-shell activated"
  '';

}
