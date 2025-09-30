{{- define "ipfs.fullname" -}}
{{- printf "%s-%s" .Release.Name "ipfs" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
