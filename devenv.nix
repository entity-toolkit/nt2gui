{ pkgs, ... }:

{
  name = "nt2gui";

  packages = with pkgs; [
    zlib

    taplo
    vscode-langservers-extracted
    black
    pyright

    emmet-ls
    typescript-language-server
    yaml-language-server
    eslint
    mdformat
    prettierd
  ];

  languages.python = {
    enable = true;
    package = pkgs.python313;
    libraries = [ pkgs.zlib ];
    venv = {
      enable = true;
      requirements = ./requirements.txt;
    };
  };

  languages.javascript = {
    enable = true;
    npm = {
      enable = true;
      install.enable = true;
    };
  };

  enterShell = ''
    echo "nt2gui devenv activated"
  '';
}
