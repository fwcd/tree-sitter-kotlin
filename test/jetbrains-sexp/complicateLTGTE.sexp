(source_file [0, 0] - [3, 0]
  (function_declaration [0, 0] - [2, 1]
    (simple_identifier [0, 4] - [0, 8])
    (function_value_parameters [0, 8] - [0, 24]
      (parameter [0, 9] - [0, 15]
        (simple_identifier [0, 9] - [0, 10])
        (user_type [0, 12] - [0, 15]
          (type_identifier [0, 12] - [0, 15])))
      (parameter [0, 17] - [0, 23]
        (simple_identifier [0, 17] - [0, 18])
        (user_type [0, 20] - [0, 23]
          (type_identifier [0, 20] - [0, 23]))))
    (function_body [0, 25] - [2, 1]
      (statements [1, 4] - [1, 40]
        (if_expression [1, 4] - [1, 40]
          condition: (comparison_expression [1, 8] - [1, 36]
            (simple_identifier [1, 8] - [1, 9])
            (parenthesized_expression [1, 12] - [1, 36]
              (if_expression [1, 13] - [1, 35]
                condition: (comparison_expression [1, 17] - [1, 25]
                  (simple_identifier [1, 17] - [1, 18])
                  (integer_literal [1, 22] - [1, 25]))
                consequence: (control_structure_body [1, 27] - [1, 28]
                  (integer_literal [1, 27] - [1, 28]))
                alternative: (control_structure_body [1, 34] - [1, 35]
                  (integer_literal [1, 34] - [1, 35])))))
          consequence: (control_structure_body [1, 38] - [1, 40]))))))
